// Netlify Function: 物资管理 API（财务专用）
// 功能：添加、编辑、删除物资，查看物资统计

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
                    error: '您没有权限管理物资'
                })
            };
        }

        // 路由处理
        const method = event.httpMethod;
        const queryParams = event.queryStringParameters || {};

        // GET: 查看物资列表或统计
        if (method === 'GET') {
            return await handleGetInventory(supabase, queryParams, headers);
        }
        // POST: 添加物资
        else if (method === 'POST') {
            return await handleAddItem(supabase, user, adminRole, event.body, headers);
        }
        // PUT: 编辑物资
        else if (method === 'PUT') {
            return await handleUpdateItem(supabase, user, adminRole, event.body, headers);
        }
        // DELETE: 删除物资
        else if (method === 'DELETE') {
            return await handleDeleteItem(supabase, user, adminRole, event.body, headers);
        }
        else {
            return {
                statusCode: 405,
                headers,
                body: JSON.stringify({ error: 'Method not allowed' })
            };
        }

    } catch (error) {
        console.error('物资管理 API 错误:', error);
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

// 查看物资列表
async function handleGetInventory(supabase, queryParams, headers) {
    const category = queryParams.category; // 'fixed_asset' or 'consumable'
    const approved = queryParams.approved; // 'true' or 'false'

    let query = supabase
        .from('inventory')
        .select(`
            *,
            modifier:last_modified_by (
                real_name,
                student_id
            )
        `)
        .order('created_at', { ascending: false });

    if (category) {
        query = query.eq('category', category);
    }
    if (approved !== undefined) {
        query = query.eq('approved', approved === 'true');
    }

    const { data: items, error } = await query;

    if (error) throw error;

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            items: items || []
        })
    };
}

// 添加物资
async function handleAddItem(supabase, user, adminRole, body, headers) {
    const itemData = JSON.parse(body);
    const { name, category, quantity, unit, description, purchaseDate, price } = itemData;

    if (!name || !category || !unit) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                success: false,
                error: '缺少必要参数：name, category, unit'
            })
        };
    }

    // 验证类别
    if (!['fixed_asset', 'consumable'].includes(category)) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                success: false,
                error: 'category 必须是 fixed_asset 或 consumable'
            })
        };
    }

    // 财务需要审批，社长可以直接添加
    if (adminRole.role === 'treasurer') {
        // 创建审批请求
        const { data: request, error: requestError } = await supabase
            .from('approval_requests')
            .insert({
                request_type: 'inventory_add',
                requester_id: user.id,
                request_data: itemData,
                reason: `申请添加物资：${name}`,
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
                message: '已提交物资添加申请，等待社长审批',
                requestId: request.id
            })
        };
    }

    // 社长直接添加
    const { data: item, error: itemError } = await supabase
        .from('inventory')
        .insert({
            name,
            category,
            quantity: quantity || 0,
            unit,
            description: description || '',
            purchase_date: purchaseDate || null,
            price: price || null,
            last_modified_by: user.id,
            approved: true
        })
        .select()
        .single();

    if (itemError) throw itemError;

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            message: '物资添加成功',
            item
        })
    };
}

// 编辑物资
async function handleUpdateItem(supabase, user, adminRole, body, headers) {
    const { itemId, ...updateData } = JSON.parse(body);

    if (!itemId) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                success: false,
                error: '缺少必要参数：itemId'
            })
        };
    }

    // 查询物资
    const { data: existingItem, error: fetchError } = await supabase
        .from('inventory')
        .select('*')
        .eq('id', itemId)
        .single();

    if (fetchError || !existingItem) {
        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({
                success: false,
                error: '物资不存在'
            })
        };
    }

    // 财务需要审批，社长可以直接编辑
    if (adminRole.role === 'treasurer') {
        // 创建审批请求
        const { data: request, error: requestError } = await supabase
            .from('approval_requests')
            .insert({
                request_type: 'inventory_edit',
                requester_id: user.id,
                request_data: updateData,
                target_id: itemId,
                reason: `申请编辑物资：${existingItem.name}`,
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
                message: '已提交编辑物资申请，等待社长审批',
                requestId: request.id
            })
        };
    }

    // 社长直接编辑
    const { error: updateError } = await supabase
        .from('inventory')
        .update({
            ...updateData,
            last_modified_by: user.id
        })
        .eq('id', itemId);

    if (updateError) throw updateError;

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            message: '物资更新成功'
        })
    };
}

// 删除物资
async function handleDeleteItem(supabase, user, adminRole, body, headers) {
    const { itemId } = JSON.parse(body);

    if (!itemId) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                success: false,
                error: '缺少必要参数：itemId'
            })
        };
    }

    // 查询物资
    const { data: existingItem, error: fetchError } = await supabase
        .from('inventory')
        .select('*')
        .eq('id', itemId)
        .single();

    if (fetchError || !existingItem) {
        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({
                success: false,
                error: '物资不存在'
            })
        };
    }

    // 财务需要审批，社长可以直接删除
    if (adminRole.role === 'treasurer') {
        // 创建审批请求
        const { data: request, error: requestError } = await supabase
            .from('approval_requests')
            .insert({
                request_type: 'inventory_delete',
                requester_id: user.id,
                request_data: { itemId },
                target_id: itemId,
                reason: `申请删除物资：${existingItem.name}`,
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
                message: '已提交删除物资申请，等待社长审批',
                requestId: request.id
            })
        };
    }

    // 社长直接删除
    const { error: deleteError } = await supabase
        .from('inventory')
        .delete()
        .eq('id', itemId);

    if (deleteError) throw deleteError;

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            message: '物资删除成功'
        })
    };
}
