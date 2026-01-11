// Netlify Function: 管理员角色管理 API
// 功能：任命/撤销管理员，查看管理员列表

const { createClient } = require('@supabase/supabase-js');

// 角色权限映射
const ROLES = {
    president: '社长',
    treasurer: '财务',
    vice_president: '副社长',
    activity_director: '活动部部长',
    advisor: '指导老师'
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

        // 路由处理
        const method = event.httpMethod;
        const path = event.path;

        // GET: 查看管理员列表
        if (method === 'GET') {
            return await handleGetAdmins(supabase, user, headers);
        }
        // POST: 任命管理员
        else if (method === 'POST') {
            return await handleAppointAdmin(supabase, user, event.body, headers);
        }
        // DELETE: 撤销管理员
        else if (method === 'DELETE') {
            return await handleRevokeAdmin(supabase, user, event.body, headers);
        }
        else {
            return {
                statusCode: 405,
                headers,
                body: JSON.stringify({ error: 'Method not allowed' })
            };
        }

    } catch (error) {
        console.error('管理员角色 API 错误:', error);
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

// 查看管理员列表
async function handleGetAdmins(supabase, user, headers) {
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
                error: '您没有权限查看管理员列表'
            })
        };
    }

    // 查询所有活跃的管理员及其资料
    const { data: admins, error } = await supabase
        .from('admin_roles')
        .select(`
            id,
            user_id,
            role,
            appointed_at,
            appointed_by,
            profiles:user_id (
                real_name,
                student_id,
                college,
                email
            )
        `)
        .eq('is_active', true)
        .order('appointed_at', { ascending: false });

    if (error) throw error;

    // 格式化返回数据
    const formattedAdmins = admins.map(admin => ({
        id: admin.id,
        userId: admin.user_id,
        role: admin.role,
        roleName: ROLES[admin.role] || admin.role,
        appointedAt: admin.appointed_at,
        appointedBy: admin.appointed_by,
        profile: admin.profiles
    }));

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            admins: formattedAdmins,
            currentUserRole: adminRole.role,
            currentUserRoleName: ROLES[adminRole.role]
        })
    };
}

// 任命管理员
async function handleAppointAdmin(supabase, user, body, headers) {
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
                error: '只有社长才能任命管理员'
            })
        };
    }

    // 解析请求体
    const { targetUserId, role } = JSON.parse(body);

    if (!targetUserId || !role) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                success: false,
                error: '缺少必要参数：targetUserId 和 role'
            })
        };
    }

    // 验证角色类型
    if (!ROLES[role]) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                success: false,
                error: '无效的角色类型'
            })
        };
    }

    // 检查目标用户是否存在
    const { data: targetUser } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', targetUserId)
        .single();

    if (!targetUser) {
        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({
                success: false,
                error: '目标用户不存在'
            })
        };
    }

    // 检查用户是否已经有活跃的管理员角色
    const { data: existingRole } = await supabase
        .from('admin_roles')
        .select('*')
        .eq('user_id', targetUserId)
        .eq('is_active', true)
        .maybeSingle();

    if (existingRole) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                success: false,
                error: `该用户已经是${ROLES[existingRole.role]}，请先撤销旧角色`
            })
        };
    }

    // 如果是任命新社长，需要先撤销当前社长的角色
    if (role === 'president') {
        // 撤销当前社长（自己）的角色
        await supabase
            .from('admin_roles')
            .update({ is_active: false })
            .eq('user_id', user.id)
            .eq('role', 'president');
    }

    // 任命新管理员
    const { data: newAdmin, error: insertError } = await supabase
        .from('admin_roles')
        .insert({
            user_id: targetUserId,
            role: role,
            appointed_by: user.id,
            is_active: true
        })
        .select(`
            *,
            profiles:user_id (
                real_name,
                student_id,
                college,
                email
            )
        `)
        .single();

    if (insertError) throw insertError;

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            message: `成功任命 ${targetUser.real_name} 为${ROLES[role]}`,
            admin: {
                id: newAdmin.id,
                userId: newAdmin.user_id,
                role: newAdmin.role,
                roleName: ROLES[newAdmin.role],
                appointedAt: newAdmin.appointed_at,
                profile: newAdmin.profiles
            }
        })
    };
}

// 撤销管理员
async function handleRevokeAdmin(supabase, user, body, headers) {
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
                error: '只有社长才能撤销管理员'
            })
        };
    }

    // 解析请求体
    const { targetUserId } = JSON.parse(body);

    if (!targetUserId) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                success: false,
                error: '缺少必要参数：targetUserId'
            })
        };
    }

    // 不能撤销自己
    if (targetUserId === user.id) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                success: false,
                error: '不能撤销自己的社长角色'
            })
        };
    }

    // 查找目标管理员角色
    const { data: targetRole } = await supabase
        .from('admin_roles')
        .select(`
            *,
            profiles:user_id (
                real_name
            )
        `)
        .eq('user_id', targetUserId)
        .eq('is_active', true)
        .maybeSingle();

    if (!targetRole) {
        return {
            statusCode: 404,
            headers,
            body: JSON.stringify({
                success: false,
                error: '该用户不是管理员或已被撤销'
            })
        };
    }

    // 撤销管理员角色
    const { error: updateError } = await supabase
        .from('admin_roles')
        .update({ is_active: false })
        .eq('id', targetRole.id);

    if (updateError) throw updateError;

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
            success: true,
            message: `成功撤销 ${targetRole.profiles.real_name} 的${ROLES[targetRole.role]}职位`
        })
    };
}
