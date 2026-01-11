// netlify/functions/cancel-registration.js
// 取消报名 API

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase 配置缺失');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { registrationId, userId } = JSON.parse(event.body);

    if (!registrationId || !userId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false,
          error: '缺少必要参数' 
        })
      };
    }

    // 1. 验证报名记录
    const { data: registration, error: checkError } = await supabase
      .from('registrations')
      .select(`
        *,
        event_groups(name, event_id),
        events(title)
      `)
      .eq('id', registrationId)
      .eq('user_id', userId)
      .single();

    if (checkError || !registration) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({
          success: false,
          message: '未找到报名记录或无权限取消'
        })
      };
    }

    // 2. 删除报名记录（触发器会自动减少 claimed）
    const { error: deleteError } = await supabase
      .from('registrations')
      .delete()
      .eq('id', registrationId);

    if (deleteError) {
      console.error('删除报名记录失败:', deleteError);
      throw new Error('取消报名失败');
    }

    // 3. 返回成功
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: '取消报名成功',
        groupName: registration.event_groups?.name || '',
        eventTitle: registration.events?.title || ''
      })
    };

  } catch (error) {
    console.error('取消报名 API 错误:', error);
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
