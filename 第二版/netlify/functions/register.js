// Netlify Function: 活动报名 API
// 处理并发抢票逻辑，防止超卖

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
    // 只允许 POST 请求
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' })
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

        // 初始化 Supabase 管理客户端（使用 service role key）
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 解析请求体
        const { groupId, eventId } = JSON.parse(event.body);
        // 使用验证后的用户 ID，忽略客户端传递的 userId
        const userId = user.id;

        if (!groupId || !eventId) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    success: false,
                    error: '缺少必要参数'
                })
            };
        }

        // ========== 核心并发控制逻辑 ==========
        // 使用数据库事务确保原子性操作

        // 1. 检查用户是否已报名该活动的其他分组（互斥锁）
        const { data: existingReg, error: checkError } = await supabase
            .from('registrations')
            .select('*')
            .eq('user_id', userId)
            .eq('event_id', eventId)
            .maybeSingle();

        if (checkError) {
            throw checkError;
        }

        if (existingReg) {
            return {
                statusCode: 200,
                body: JSON.stringify({
                    success: false,
                    message: '您已报名该活动的其他分组'
                })
            };
        }

        // 2. 检查库存是否充足
        const { data: group, error: groupError } = await supabase
            .from('event_groups')
            .select('*')
            .eq('id', groupId)
            .single();

        if (groupError) throw groupError;

        // 检查库存
        if (group.claimed >= group.capacity) {
            return {
                statusCode: 200,
                body: JSON.stringify({
                    success: false,
                    message: '该分组已满'
                })
            };
        }

        // 3. 创建报名记录
        // 注意：数据库触发器 update_group_claimed_safe() 会自动处理 claimed 计数
        // 触发器使用 FOR UPDATE 锁定行，确保并发安全
        const { data: registration, error: regError } = await supabase
            .from('registrations')
            .insert({
                user_id: userId,
                group_id: groupId,
                event_id: eventId
            })
            .select()
            .single();

        if (regError) {
            // 检查是否是因为名额已满（触发器抛出的异常）
            if (regError.message && regError.message.includes('名额已满')) {
                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        success: false,
                        message: '名额已被抢完，请稍后再试'
                    })
                };
            }
            throw regError;
        }

        // 5. 返回成功结果（包含签到二维码）
        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                registration: {
                    id: registration.id,
                    groupId: groupId,
                    eventId: eventId
                },
                checkinImg: group.checkin_img || 'https://via.placeholder.com/300?text=签到二维码',
                message: '报名成功！'
            })
        };

    } catch (error) {
        console.error('报名 API 错误:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                success: false,
                error: error.message || '服务器错误'
            })
        };
    }
};
