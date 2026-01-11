// Netlify Function: 创建用户资料 API
// 使用 service role key 绕过 RLS 策略

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
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
                body: JSON.stringify({
                    success: false,
                    error: '身份验证失败，请重新登录'
                })
            };
        }

        // 使用 service role key 创建客户端（绕过 RLS）
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 解析请求体
        const { realName, studentId, college, email } = JSON.parse(event.body);
        // 使用验证后的用户 ID，忽略客户端传递的 userId
        const userId = user.id;

        if (!realName || !studentId || !college || !email) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    success: false,
                    error: '缺少必要参数'
                })
            };
        }

        // 创建用户资料（使用 service role key 可以绕过 RLS）
        const { data, error } = await supabase
            .from('profiles')
            .upsert({
                id: userId,
                real_name: realName,
                student_id: studentId,
                college: college,
                email: email
            })
            .select()
            .single();

        if (error) {
            // 如果是因为已存在而失败，也算成功
            if (error.code === '23505') { // unique_violation
                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        success: true,
                        message: '用户资料已存在',
                        profile: data
                    })
                };
            }
            throw error;
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                profile: data
            })
        };

    } catch (error) {
        console.error('创建用户资料错误:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                success: false,
                error: error.message || '服务器错误'
            })
        };
    }
};
