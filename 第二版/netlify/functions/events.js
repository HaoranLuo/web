// Netlify Function: 获取活动列表 API（可选，如果前端直接调用 Supabase 可不用）

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseAnonKey) {
            throw new Error('Supabase 配置缺失');
        }

        const supabase = createClient(supabaseUrl, supabaseAnonKey);

        // 获取活动列表
        const { data: events, error: eventsError } = await supabase
            .from('events')
            .select('*')
            .eq('status', 'open')
            .order('created_at', { ascending: false });

        if (eventsError) throw eventsError;

        // 获取分组信息
        const eventIds = events.map(e => e.id);
        const { data: groups, error: groupsError } = await supabase
            .from('event_groups')
            .select('*')
            .in('event_id', eventIds);

        if (groupsError) throw groupsError;

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                events,
                groups
            })
        };

    } catch (error) {
        console.error('获取活动列表错误:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: error.message || '服务器错误'
            })
        };
    }
};
