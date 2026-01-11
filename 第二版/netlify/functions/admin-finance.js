// Netlify Function: 财务管理 API（财务专用）
// 功能：添加、编辑、删除财务记录，查看财务统计

const { createClient } = require('@supabase/supabase-js');

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

        // 检查用户是否是财务或社长
        const { data: adminRole } = await supabase
            .from('admin_roles')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .maybeSingle();

        if (!adminRole || !['president', 'treasurer'].includes(adminRole.role)) {
            return {
                statusCode: 403,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: '您没有权限管理财务'
                })
            };
        }

        // 路由处理
        const method = event.httpMethod;
        const queryParams = event.queryStringParameters || {};

        // GET: 查看财务记录或统计
        if (method === 'GET') {
            const action = queryParams.action;
            if (action === 'summary') {
                return await handleGetSummary(supabase, headers);
            } else {
                return await handleGetRecords(supabase, queryParams, headers);
            }
        }
        // POST: 添加财务记录
        else if (method === 'POST') {
            return await handleAddRecord(supabase, user, adminRole, event.body, headers);
        }
        // PUT: 编辑财务记录
        else if (method === 'PUT') {
            return await handleUpdateRecord(supabase, user, adminRole, event.body, headers);
        }
        // DELETE: 删除财务记录
        else if (method === 'DELETE') {
            return await handleDeleteRecord(supabase, user, adminRole, event.body, headers);
        }
        else {
            return {
                statusCode: 405,
                headers,
                body: JSON.stringify({ error: 'Method not allowed' })
            };
        }

    } catch (error) {
        console.error('财务管理 API 错误:', error);
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

// 查看财务记录
async function handleGetRecords(supabase, queryParams, headers) {
    const type = queryParams.type; // 'income' or 'expense'
    const approved = queryParams.approved; // 'true' or 'false'

    let query = supabase
        .from('finance_records')
        .select(`
            *,
            recorder:recorded_by (
                real_name,
                student_id
            )
        `)
        .order('created_at', { ascending: false });

    if (type) {
        query = query.eq('type', type);
    }
    if (approved !== undefined) {
        query = query.eq('approved', approved === 'true');
    }

    const { data: records, error } = await query;

    if (error) throw error;

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            records: records || []
        })
    };
}

// 查看财务汇总
async function handleGetSummary(supabase, headers) {
    // 使用数据库视图获取汇总信息
    const { data: summary, error } = await supabase
        .from('finance_summary')
        .select('*');

    if (error) throw error;

    // 计算总余额
    const income = summary.find(s => s.type === 'income')?.total_amount || 0;
    const expense = summary.find(s => s.type === 'expense')?.total_amount || 0;
    const balance = income - expense;

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            summary: {
                income,
                expense,
                balance,
                details: summary
            }
        })
    };
}

// 添加财务记录
async function handleAddRecord(supabase, user, adminRole, body, headers) {
    const recordData = JSON.parse(body);
    const { type, amount, description, notes } = recordData;

    if (!type || !amount || !description) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                success: false,
                error: '缺少必要参数：type, amount, description'
            })
        };
    }

    // 验证类型
    if (!['income', 'expense'].includes(type)) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                success: false,
                error: 'type 必须是 income 或 expense'
            })
        };
    }

    // 验证金额
    if (amount <= 0) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                success: false,
                error: '金额必须大于 0'
            })
        };
    }

    // 财务需要审批，社长可以直接添加
    if (adminRole.role === 'treasurer') {
        // 创建审批请求
        const { data: request, error: requestError } = await supabase
            .from('approval_requests')
            .insert({
                request_type: 'finance_add',
                requester_id: user.id,
                request_data: { type, amount, description, notes },
                reason: `申请添加财务记录：${type === 'income' ? '收入' : '支出'} ${amount}元 - ${description}`,
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
                message: '已提交财务记录申请，等待社长审批',
                requestId: request.id
            })
        };
    }

    // 社长直接添加
    const { data: record, error: recordError } = await supabase
        .from('finance_records')
        .insert({
            type,
            amount,
            description,
            notes: notes || '',
            recorded_by: user.id,
            approved: true
        })
        .select()
        .single();

    if (recordError) throw recordError;

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            message: '财务记录添加成功',
            record
        })
    };
}

// 编辑财务记录
async function handleUpdateRecord(supabase, user, adminRole, body, headers) {
    const { recordId, ...updateData } = JSON.parse(body);

    if (!recordId) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                success: false,
                error: '缺少必要参数：recordId'
            })
        };
    }

    // 查询记录
    const { data: existingRecord, error: fetchError } = await supabase
        .from('finance_records')
        .select('*')
        .eq('id', recordId)
        .single();

    if (fetchError || !existingRecord) {
        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({
                success: false,
                error: '财务记录不存在'
            })
        };
    }

    // 财务需要审批，社长可以直接编辑
    if (adminRole.role === 'treasurer') {
        // 创建审批请求
        const { data: request, error: requestError } = await supabase
            .from('approval_requests')
            .insert({
                request_type: 'finance_edit',
                requester_id: user.id,
                request_data: updateData,
                target_id: recordId,
                reason: `申请编辑财务记录：${existingRecord.description}`,
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
                message: '已提交编辑财务记录申请，等待社长审批',
                requestId: request.id
            })
        };
    }

    // 社长直接编辑
    const { error: updateError } = await supabase
        .from('finance_records')
        .update(updateData)
        .eq('id', recordId);

    if (updateError) throw updateError;

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            message: '财务记录更新成功'
        })
    };
}

// 删除财务记录
async function handleDeleteRecord(supabase, user, adminRole, body, headers) {
    const { recordId } = JSON.parse(body);

    if (!recordId) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                success: false,
                error: '缺少必要参数：recordId'
            })
        };
    }

    // 查询记录
    const { data: existingRecord, error: fetchError } = await supabase
        .from('finance_records')
        .select('*')
        .eq('id', recordId)
        .single();

    if (fetchError || !existingRecord) {
        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({
                success: false,
                error: '财务记录不存在'
            })
        };
    }

    // 财务需要审批，社长可以直接删除
    if (adminRole.role === 'treasurer') {
        // 创建审批请求
        const { data: request, error: requestError } = await supabase
            .from('approval_requests')
            .insert({
                request_type: 'finance_delete',
                requester_id: user.id,
                request_data: { recordId },
                target_id: recordId,
                reason: `申请删除财务记录：${existingRecord.description}`,
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
                message: '已提交删除财务记录申请，等待社长审批',
                requestId: request.id
            })
        };
    }

    // 社长直接删除
    const { error: deleteError } = await supabase
        .from('finance_records')
        .delete()
        .eq('id', recordId);

    if (deleteError) throw deleteError;

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            message: '财务记录删除成功'
        })
    };
}
