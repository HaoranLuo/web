// Netlify Function: 获取公开配置（仅返回前端需要的配置）

// 获取安全的 CORS origin
function getAllowedOrigin(event) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
        : [];

    const requestOrigin = event.headers.origin || event.headers.Origin;

    // 如果配置了允许的域名列表，检查请求来源是否在列表中
    if (allowedOrigins.length > 0) {
        if (allowedOrigins.includes(requestOrigin)) {
            return requestOrigin;
        }
        // 如果不在列表中，返回第一个允许的域名
        return allowedOrigins[0];
    }

    // 开发环境：允许 localhost
    if (requestOrigin && (requestOrigin.includes('localhost') || requestOrigin.includes('127.0.0.1'))) {
        return requestOrigin;
    }

    // Netlify 部署环境：允许 .netlify.app 域名
    if (requestOrigin && requestOrigin.includes('.netlify.app')) {
        return requestOrigin;
    }

    // 默认不设置，浏览器会阻止跨域请求
    return requestOrigin || '';
}

exports.handler = async (event, context) => {
    const allowedOrigin = getAllowedOrigin(event);

    // 处理预检请求
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: {
                'Access-Control-Allow-Origin': allowedOrigin,
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '86400'
            },
            body: ''
        };
    }

    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    // 只返回前端需要的公开配置
    // 注意：不返回 SERVICE_ROLE_KEY（这是后端专用的）
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': allowedOrigin,
            'Cache-Control': 'public, max-age=3600' // 缓存 1 小时
        },
        body: JSON.stringify({
            supabaseUrl: process.env.SUPABASE_URL || '',
            supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
        })
    };
};
