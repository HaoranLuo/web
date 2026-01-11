// Netlify Function: 活动管理 API（管理员专用）
// 功能：创建、编辑、删除活动，支持多种活动类型

const { createClient } = require('@supabase/supabase-js');

// 活动类型映射
const EVENT_TYPES = {
    group_play: '周常群打活动',
    competition: '比赛活动',
    other: '其他活动'
};

exports.handler = async (event, context) => {
    // 设置 CORS 头
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    };

    // 处理预检请求
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    try {
        // 获取环境变量
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
            throw new Error('Supabase 配置缺失');
        }

        // 从请求头获取用户的 JWT token
        const authHeader = event.headers.authorization || event.headers.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: '未授权：请先登录'
                })
            };
        }

        const token = authHeader.replace('Bearer ', '');

        // 使用 anon key 创建客户端来验证用户 token
        const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
            global: {
                headers: { Authorization: `Bearer ${token}` }
            }
        });

        // 验证用户身份
        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
        if (authError || !user) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: '身份验证失败，请重新登录'
                })
            };
        }

        // 初始化 Supabase 管理客户端（使用 service role key）
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 检查用户是否有活动管理权限
        const { data: adminRole } = await supabase
            .from('admin_roles')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .maybeSingle();

        if (!adminRole || !['president', 'vice_president', 'activity_director'].includes(adminRole.role)) {
            return {
                statusCode: 403,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: '您没有权限管理活动'
                })
            };
        }

        // 路由处理
        const method = event.httpMethod;
        const queryParams = event.queryStringParameters || {};

        // GET: 查看活动列表或统计
        if (method === 'GET') {
            const action = queryParams.action;
            if (action === 'statistics') {
                return await handleGetStatistics(supabase, headers);
            } else {
                return await handleGetEvents(supabase, queryParams, headers);
            }
        }
        // POST: 创建活动
        else if (method === 'POST') {
            return await handleCreateEvent(supabase, user, adminRole, event.body, headers);
        }
        // PUT: 编辑活动
        else if (method === 'PUT') {
            return await handleUpdateEvent(supabase, user, adminRole, event.body, headers);
        }
        // DELETE: 删除活动
        else if (method === 'DELETE') {
            return await handleDeleteEvent(supabase, user, adminRole, event.body, headers);
        }
        else {
            return {
                statusCode: 405,
                headers,
                body: JSON.stringify({ error: 'Method not allowed' })
            };
        }

    } catch (error) {
        console.error('活动管理 API 错误:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message || '服务器错误'
            })
        };
    }
};

// 查看活动列表
async function handleGetEvents(supabase, queryParams, headers) {
    const status = queryParams.status; // 'open' or 'ended'
    const type = queryParams.type; // 'group_play', 'competition', 'other'

    let query = supabase
        .from('events')
        .select(`
            *,
            creator:created_by (
                real_name,
                student_id
            ),
            event_groups (
                id,
                name,
                capacity,
                claimed,
                share_link,
                checkin_img,
                ticket_count,
                capacity_per_ticket,
                event_tickets (
                    id,
                    ticket_number,
                    capacity,
                    claimed
                )
            )
        `)
        .order('created_at', { ascending: false });

    if (status) {
        query = query.eq('status', status);
    }
    if (type) {
        query = query.eq('type', type);
    }

    const { data: events, error } = await query;

    if (error) throw error;

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            events: events || []
        })
    };
}

// 查看活动统计
async function handleGetStatistics(supabase, headers) {
    // 使用数据库视图获取统计信息
    const { data: stats, error } = await supabase
        .from('event_statistics')
        .select('*');

    if (error) throw error;

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            statistics: stats || []
        })
    };
}

// 创建活动
async function handleCreateEvent(supabase, user, adminRole, body, headers) {
    const eventData = JSON.parse(body);
    const { title, description, type, status, registrationLink, groups } = eventData;

    if (!title || !type) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                success: false,
                error: '缺少必要参数：title 和 type'
            })
        };
    }

    // 验证活动类型
    if (!EVENT_TYPES[type]) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                success: false,
                error: '无效的活动类型'
            })
        };
    }

    // 非社长需要审批
    if (adminRole.role !== 'president') {
        // 创建审批请求
        const { data: request, error: requestError } = await supabase
            .from('approval_requests')
            .insert({
                request_type: 'event_create',
                requester_id: user.id,
                request_data: eventData,
                reason: `申请创建${EVENT_TYPES[type]}：${title}`,
                status: 'pending'
            })
            .select()
            .single();

        if (requestError) throw requestError;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                needsApproval: true,
                message: '已提交创建活动申请，等待社长审批',
                requestId: request.id
            })
        };
    }

    // 社长直接创建活动
    const { data: newEvent, error: eventError } = await supabase
        .from('events')
        .insert({
            title,
            description: description || '',
            type,
            status: status || 'open',
            registration_link: registrationLink || null,
            created_by: user.id,
            requires_approval: false
        })
        .select()
        .single();

    if (eventError) throw eventError;

    // 创建分组和票
    if (groups && groups.length > 0) {
        for (const group of groups) {
            const { data: newGroup, error: groupError } = await supabase
                .from('event_groups')
                .insert({
                    event_id: newEvent.id,
                    name: group.name,
                    capacity: group.capacity || group.capacity_per_ticket * group.ticket_count,
                    share_link: group.share_link || null,
                    checkin_img: group.checkin_img || null,
                    ticket_count: group.ticket_count || 1,
                    capacity_per_ticket: group.capacity_per_ticket || group.capacity
                })
                .select()
                .single();

            if (groupError) throw groupError;

            // 如果是多票活动，创建票
            if (group.ticket_count > 1) {
                const tickets = [];
                for (let i = 1; i <= group.ticket_count; i++) {
                    tickets.push({
                        group_id: newGroup.id,
                        ticket_number: i,
                        capacity: group.capacity_per_ticket,
                        qr_code_url: group.checkin_img || null
                    });
                }
                await supabase.from('event_tickets').insert(tickets);
            }
        }
    }

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            message: '活动创建成功',
            event: newEvent
        })
    };
}

// 编辑活动
async function handleUpdateEvent(supabase, user, adminRole, body, headers) {
    const { eventId, ...updateData } = JSON.parse(body);

    if (!eventId) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                success: false,
                error: '缺少必要参数：eventId'
            })
        };
    }

    // 查询活动
    const { data: existingEvent, error: fetchError } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single();

    if (fetchError || !existingEvent) {
        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({
                success: false,
                error: '活动不存在'
            })
        };
    }

    // 非社长需要审批
    if (adminRole.role !== 'president') {
        // 创建审批请求
        const { data: request, error: requestError } = await supabase
            .from('approval_requests')
            .insert({
                request_type: 'event_edit',
                requester_id: user.id,
                request_data: updateData,
                target_id: eventId,
                reason: `申请编辑活动：${existingEvent.title}`,
                status: 'pending'
            })
            .select()
            .single();

        if (requestError) throw requestError;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                needsApproval: true,
                message: '已提交编辑活动申请，等待社长审批',
                requestId: request.id
            })
        };
    }

    // 社长直接编辑活动
    const { error: updateError } = await supabase
        .from('events')
        .update(updateData)
        .eq('id', eventId);

    if (updateError) throw updateError;

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            message: '活动更新成功'
        })
    };
}

// 删除活动
async function handleDeleteEvent(supabase, user, adminRole, body, headers) {
    const { eventId } = JSON.parse(body);

    if (!eventId) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                success: false,
                error: '缺少必要参数：eventId'
            })
        };
    }

    // 查询活动
    const { data: existingEvent, error: fetchError } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single();

    if (fetchError || !existingEvent) {
        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({
                success: false,
                error: '活动不存在'
            })
        };
    }

    // 非社长需要审批
    if (adminRole.role !== 'president') {
        // 创建审批请求
        const { data: request, error: requestError } = await supabase
            .from('approval_requests')
            .insert({
                request_type: 'event_delete',
                requester_id: user.id,
                request_data: { eventId },
                target_id: eventId,
                reason: `申请删除活动：${existingEvent.title}`,
                status: 'pending'
            })
            .select()
            .single();

        if (requestError) throw requestError;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                needsApproval: true,
                message: '已提交删除活动申请，等待社长审批',
                requestId: request.id
            })
        };
    }

    // 社长直接删除活动（先删除关联数据）
    // 删除票
    await supabase.from('event_tickets')
        .delete()
        .in('group_id',
            supabase.from('event_groups').select('id').eq('event_id', eventId)
        );

    // 删除报名记录
    await supabase.from('registrations')
        .delete()
        .eq('event_id', eventId);

    // 删除分组
    await supabase.from('event_groups')
        .delete()
        .eq('event_id', eventId);

    // 删除活动
    const { error: deleteError } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId);

    if (deleteError) throw deleteError;

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            message: '活动删除成功'
        })
    };
}
