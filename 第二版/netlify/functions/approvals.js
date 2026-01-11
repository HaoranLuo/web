// Netlify Function: 审批流程 API
// 功能：创建审批请求、审批/拒绝请求、查看审批列表

const { createClient } = require('@supabase/supabase-js');

// 请求类型映射
const REQUEST_TYPES = {
    finance_add: '添加财务记录',
    finance_edit: '编辑财务记录',
    finance_delete: '删除财务记录',
    inventory_add: '添加物资',
    inventory_edit: '编辑物资',
    inventory_delete: '删除物资',
    event_create: '创建活动',
    event_edit: '编辑活动',
    event_delete: '删除活动'
};

exports.handler = async (event, context) => {
    // 设置 CORS 头
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS'
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

        // 路由处理
        const method = event.httpMethod;
        const queryParams = event.queryStringParameters || {};

        // GET: 查看审批列表
        if (method === 'GET') {
            const action = queryParams.action;
            if (action === 'pending') {
                // 查看待审批列表（社长专用）
                return await handleGetPendingApprovals(supabase, user, headers);
            } else {
                // 查看自己的审批请求
                return await handleGetMyRequests(supabase, user, headers);
            }
        }
        // POST: 创建审批请求
        else if (method === 'POST') {
            return await handleCreateRequest(supabase, user, event.body, headers);
        }
        // PUT: 审批/拒绝请求
        else if (method === 'PUT') {
            return await handleApproveRequest(supabase, user, event.body, headers);
        }
        else {
            return {
                statusCode: 405,
                headers,
                body: JSON.stringify({ error: 'Method not allowed' })
            };
        }

    } catch (error) {
        console.error('审批流程 API 错误:', error);
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

// 查看待审批列表（社长专用）
async function handleGetPendingApprovals(supabase, user, headers) {
    // 检查用户是否是社长
    const { data: presidentRole } = await supabase
        .from('admin_roles')
        .select('*')
        .eq('user_id', user.id)
        .eq('role', 'president')
        .eq('is_active', true)
        .maybeSingle();

    if (!presidentRole) {
        return {
            statusCode: 403,
            headers,
            body: JSON.stringify({
                success: false,
                error: '只有社长才能查看待审批列表'
            })
        };
    }

    // 查询所有待审批的请求
    const { data: requests, error } = await supabase
        .from('approval_requests')
        .select(`
            *,
            requester:requester_id (
                real_name,
                student_id,
                college
            ),
            admin_role:requester_id (
                role
            )
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

    if (error) throw error;

    // 格式化返回数据
    const formattedRequests = requests.map(req => ({
        id: req.id,
        requestType: req.request_type,
        requestTypeName: REQUEST_TYPES[req.request_type] || req.request_type,
        requesterId: req.requester_id,
        requesterName: req.requester?.real_name,
        requesterRole: req.admin_role?.role,
        status: req.status,
        requestData: req.request_data,
        reason: req.reason,
        targetId: req.target_id,
        createdAt: req.created_at
    }));

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            requests: formattedRequests,
            count: formattedRequests.length
        })
    };
}

// 查看自己的审批请求
async function handleGetMyRequests(supabase, user, headers) {
    // 查询用户的所有审批请求
    const { data: requests, error } = await supabase
        .from('approval_requests')
        .select(`
            *,
            approver:approver_id (
                real_name
            )
        `)
        .eq('requester_id', user.id)
        .order('created_at', { ascending: false });

    if (error) throw error;

    // 格式化返回数据
    const formattedRequests = requests.map(req => ({
        id: req.id,
        requestType: req.request_type,
        requestTypeName: REQUEST_TYPES[req.request_type] || req.request_type,
        status: req.status,
        requestData: req.request_data,
        reason: req.reason,
        approvalNote: req.approval_note,
        approverName: req.approver?.real_name,
        targetId: req.target_id,
        createdAt: req.created_at,
        updatedAt: req.updated_at,
        approvedAt: req.approved_at
    }));

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            requests: formattedRequests
        })
    };
}

// 创建审批请求
async function handleCreateRequest(supabase, user, body, headers) {
    // 检查用户是否是管理员
    const { data: adminRole } = await supabase
        .from('admin_roles')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

    if (!adminRole) {
        return {
            statusCode: 403,
            headers,
            body: JSON.stringify({
                success: false,
                error: '只有管理员才能创建审批请求'
            })
        };
    }

    // 解析请求体
    const { requestType, requestData, reason, targetId } = JSON.parse(body);

    if (!requestType || !requestData) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                success: false,
                error: '缺少必要参数：requestType 和 requestData'
            })
        };
    }

    // 验证请求类型
    if (!REQUEST_TYPES[requestType]) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                success: false,
                error: '无效的请求类型'
            })
        };
    }

    // 社长的操作不需要审批
    if (adminRole.role === 'president') {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                success: false,
                error: '社长的操作不需要审批，可直接执行'
            })
        };
    }

    // 验证权限：财务只能申请财务和物资相关操作
    if (adminRole.role === 'treasurer') {
        if (!requestType.startsWith('finance_') && !requestType.startsWith('inventory_')) {
            return {
                statusCode: 403,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: '财务只能申请财务和物资相关操作'
                })
            };
        }
    }

    // 验证权限：副社长和活动部部长只能申请活动相关操作
    if (['vice_president', 'activity_director'].includes(adminRole.role)) {
        if (!requestType.startsWith('event_')) {
            return {
                statusCode: 403,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: '您只能申请活动相关操作'
                })
            };
        }
    }

    // 创建审批请求
    const { data: request, error: insertError } = await supabase
        .from('approval_requests')
        .insert({
            request_type: requestType,
            requester_id: user.id,
            request_data: requestData,
            reason: reason || '',
            target_id: targetId || null,
            status: 'pending'
        })
        .select()
        .single();

    if (insertError) throw insertError;

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            message: `已提交${REQUEST_TYPES[requestType]}申请，等待社长审批`,
            request: {
                id: request.id,
                requestType: request.request_type,
                requestTypeName: REQUEST_TYPES[request.request_type],
                status: request.status,
                createdAt: request.created_at
            }
        })
    };
}

// 审批/拒绝请求
async function handleApproveRequest(supabase, user, body, headers) {
    // 检查用户是否是社长
    const { data: presidentRole } = await supabase
        .from('admin_roles')
        .select('*')
        .eq('user_id', user.id)
        .eq('role', 'president')
        .eq('is_active', true)
        .maybeSingle();

    if (!presidentRole) {
        return {
            statusCode: 403,
            headers,
            body: JSON.stringify({
                success: false,
                error: '只有社长才能审批请求'
            })
        };
    }

    // 解析请求体
    const { requestId, action, approvalNote } = JSON.parse(body);

    if (!requestId || !action) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                success: false,
                error: '缺少必要参数：requestId 和 action'
            })
        };
    }

    // 验证 action
    if (!['approve', 'reject'].includes(action)) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                success: false,
                error: 'action 必须是 approve 或 reject'
            })
        };
    }

    // 查询审批请求
    const { data: request, error: fetchError } = await supabase
        .from('approval_requests')
        .select(`
            *,
            requester:requester_id (
                real_name
            )
        `)
        .eq('id', requestId)
        .single();

    if (fetchError || !request) {
        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({
                success: false,
                error: '审批请求不存在'
            })
        };
    }

    // 检查请求状态
    if (request.status !== 'pending') {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                success: false,
                error: '该请求已被处理'
            })
        };
    }

    // 更新审批状态
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const { error: updateError } = await supabase
        .from('approval_requests')
        .update({
            status: newStatus,
            approver_id: user.id,
            approval_note: approvalNote || '',
            approved_at: new Date().toISOString()
        })
        .eq('id', requestId);

    if (updateError) throw updateError;

    // 如果批准，执行相应的操作
    if (action === 'approve') {
        await executeApprovedAction(supabase, request);
    }

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            message: action === 'approve'
                ? `已批准${request.requester.real_name}的${REQUEST_TYPES[request.request_type]}请求`
                : `已拒绝${request.requester.real_name}的${REQUEST_TYPES[request.request_type]}请求`,
            action: action,
            requestType: request.request_type
        })
    };
}

// 执行已批准的操作
async function executeApprovedAction(supabase, request) {
    const { request_type, request_data, target_id, id } = request;

    try {
        switch (request_type) {
            case 'finance_add':
                // 添加财务记录
                await supabase.from('finance_records').insert({
                    ...request_data,
                    recorded_by: request.requester_id,
                    approval_request_id: id,
                    approved: true
                });
                break;

            case 'finance_edit':
                // 编辑财务记录
                await supabase.from('finance_records')
                    .update({
                        ...request_data,
                        approval_request_id: id,
                        approved: true
                    })
                    .eq('id', target_id);
                break;

            case 'finance_delete':
                // 删除财务记录
                await supabase.from('finance_records')
                    .delete()
                    .eq('id', target_id);
                break;

            case 'inventory_add':
                // 添加物资
                await supabase.from('inventory').insert({
                    ...request_data,
                    last_modified_by: request.requester_id,
                    approval_request_id: id,
                    approved: true
                });
                break;

            case 'inventory_edit':
                // 编辑物资
                await supabase.from('inventory')
                    .update({
                        ...request_data,
                        last_modified_by: request.requester_id,
                        approval_request_id: id,
                        approved: true
                    })
                    .eq('id', target_id);
                break;

            case 'inventory_delete':
                // 删除物资
                await supabase.from('inventory')
                    .delete()
                    .eq('id', target_id);
                break;

            case 'event_create':
                // 创建活动
                await supabase.from('events').insert({
                    ...request_data,
                    created_by: request.requester_id,
                    approval_request_id: id
                });
                break;

            case 'event_edit':
                // 编辑活动
                await supabase.from('events')
                    .update({
                        ...request_data,
                        approval_request_id: id
                    })
                    .eq('id', target_id);
                break;

            case 'event_delete':
                // 删除活动（先删除关联的分组和报名记录）
                await supabase.from('event_groups')
                    .delete()
                    .eq('event_id', target_id);
                await supabase.from('registrations')
                    .delete()
                    .eq('event_id', target_id);
                await supabase.from('events')
                    .delete()
                    .eq('id', target_id);
                break;

            default:
                console.warn(`未处理的请求类型: ${request_type}`);
        }
    } catch (error) {
        console.error('执行批准操作失败:', error);
        // 注意：这里不抛出异常，避免审批状态已更新但操作失败的情况
        // 实际生产环境中应该有更完善的事务处理
    }
}
