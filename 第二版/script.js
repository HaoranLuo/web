// ==================== 配置 ====================
let SUPABASE_URL = '';
let SUPABASE_ANON_KEY = '';
// 注意：supabase 客户端实例，不是全局 supabase SDK 对象
let supabaseClient = null;

// 动态加载配置
async function loadConfig() {
    try {
        const response = await fetch('/.netlify/functions/config');
        const config = await response.json();
        
        if (config.supabaseUrl && config.supabaseAnonKey) {
            SUPABASE_URL = config.supabaseUrl;
            SUPABASE_ANON_KEY = config.supabaseAnonKey;
            
            // 初始化 Supabase 客户端
            // 使用全局 supabase 对象（来自 CDN）
            if (window.supabase && typeof window.supabase.createClient === 'function') {
                supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                console.log('Supabase 客户端初始化成功');
            } else {
                console.error('Supabase SDK 未加载');
            }
        } else {
            console.error('Supabase 配置缺失');
        }
    } catch (error) {
        console.error('加载配置失败:', error);
    }
}

// ==================== 全局状态 ====================
let currentUser = null;
let currentRegistration = null; // 当前报名信息

// ==================== DOM 元素 ====================
const btnLogin = document.getElementById('btnLogin');
const btnLogout = document.getElementById('btnLogout');
const userStatus = document.getElementById('userStatus');
const userInfo = document.getElementById('userInfo');
const userName = document.getElementById('userName');
const authModal = document.getElementById('authModal');
const authForm = document.getElementById('authForm');
const authModalTitle = document.getElementById('authModalTitle');
const authSwitchLink = document.getElementById('authSwitchLink');
const authSwitchText = document.getElementById('authSwitchText');
const closeAuthModal = document.getElementById('closeAuthModal');
const checkinModal = document.getElementById('checkinModal');
const closeCheckinModal = document.getElementById('closeCheckinModal');
const confirmCheckin = document.getElementById('confirmCheckin');
const ticketModal = document.getElementById('ticketModal');
const closeTicketModal = document.getElementById('closeTicketModal');
const ticketLink = document.getElementById('ticketLink');
const activitiesGrid = document.getElementById('activitiesGrid');

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', async () => {
    // 先加载配置
    await loadConfig();
    
    // 检查 Supabase 是否初始化
    if (!supabaseClient) {
        console.error('Supabase 未初始化，请检查配置');
        showError('系统配置错误，请联系管理员');
        return;
    }

    // 检查用户登录状态
    await checkAuthState();
    
    // 加载活动列表
    await fetchActivities();
    
    // 加载社务公示数据
    await fetchDashboardData();
    
    // 绑定事件
    bindEvents();
    setupModalCloseOnOutsideClick();
});

// ==================== 用户认证 ====================
async function checkAuthState() {
    if (!supabaseClient) return;
    
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        currentUser = session.user;
        await loadUserProfile();
        updateUserUI(true);
    } else {
        updateUserUI(false);
    }

    // 监听认证状态变化
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
            currentUser = session.user;
            loadUserProfile().then(() => updateUserUI(true));
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            updateUserUI(false);
        }
    });
}

async function loadUserProfile() {
    if (!currentUser || !supabaseClient) return;
    
    const { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();
    
    if (error && error.code !== 'PGRST116') {
        console.error('加载用户资料失败:', error);
    } else if (data) {
        userName.textContent = data.real_name || data.email;
    }
}

function updateUserUI(isLoggedIn) {
    if (isLoggedIn) {
        btnLogin.style.display = 'none';
        userInfo.style.display = 'flex';
    } else {
        btnLogin.style.display = 'block';
        userInfo.style.display = 'none';
    }
}

// ==================== 登录/注册 Modal ====================
let isLoginMode = true;


function showAuthModal() {
    console.log('显示登录 Modal');
    if (!authModal) {
        console.error('authModal 未找到！');
        return;
    }
    updateAuthModalMode();
    authModal.classList.add('show');
    console.log('Modal class:', authModal.className);
}

function hideAuthModal() {
    authModal.classList.remove('show');
    authForm.reset();
}

function updateAuthModalMode() {
    const passwordGroup = document.getElementById('passwordGroup');
    
    // 获取需要控制的输入框 DOM 元素
    const inputName = document.getElementById('authName');
    const inputStudentId = document.getElementById('authStudentId');
    const inputCollege = document.getElementById('authCollege');

    // 获取包裹它们的 div (用来控制显示/隐藏)
    const registerFields = document.getElementById('registerFields');
    const registerFields2 = document.getElementById('registerFields2');
    const registerFields3 = document.getElementById('registerFields3');
    
    const authSubmit = document.getElementById('authSubmit');
    
    if (isLoginMode) {
        // === 登录模式 ===
        authModalTitle.textContent = '登录';
        authSubmit.textContent = '登录';
        authSwitchText.textContent = '还没有账号？';
        authSwitchLink.textContent = '立即注册';
        
        passwordGroup.style.display = 'block';
        
        // 1. 视觉上隐藏注册框
        registerFields.style.display = 'none';
        registerFields2.style.display = 'none';
        registerFields3.style.display = 'none';

        // 2. [关键修复] 移除 required 属性
        // 这样提交表单时，浏览器就会忽略这些隐藏的空框，不会报错 "not focusable"
        if (inputName) inputName.removeAttribute('required');
        if (inputStudentId) inputStudentId.removeAttribute('required');
        if (inputCollege) inputCollege.removeAttribute('required');

    } else {
        // === 注册模式 ===
        authModalTitle.textContent = '注册';
        authSubmit.textContent = '注册';
        authSwitchText.textContent = '已有账号？';
        authSwitchLink.textContent = '立即登录';
        
        passwordGroup.style.display = 'block';
        
        // 1. 显示注册框
        registerFields.style.display = 'block';
        registerFields2.style.display = 'block';
        registerFields3.style.display = 'block';

        // 2. [关键修复] 加回 required 属性
        // 确保用户在注册时必须填写这些信息
        if (inputName) inputName.setAttribute('required', '');
        if (inputStudentId) inputStudentId.setAttribute('required', '');
        if (inputCollege) inputCollege.setAttribute('required', '');
    }
}


// ==================== 活动列表 ====================
async function fetchActivities() {
    if (!supabaseClient) {
        activitiesGrid.innerHTML = '<div class="error-message">系统配置错误</div>';
        return;
    }
    
    try {
        // 获取所有开放的活动及其分组
        const { data: events, error: eventsError } = await supabaseClient
            .from('events')
            .select('*')
            .eq('status', 'open')
            .order('created_at', { ascending: false });
        
        if (eventsError) throw eventsError;
        
        if (!events || events.length === 0) {
            activitiesGrid.innerHTML = '<div class="loading">暂无活动</div>';
            return;
        }
        
        // 获取所有分组
        const eventIds = events.map(e => e.id);
        const { data: groups, error: groupsError } = await supabaseClient
            .from('event_groups')
            .select('*')
            .in('event_id', eventIds);
        
        if (groupsError) throw groupsError;
        
        // 获取当前用户的报名记录（如果已登录）
        let userRegistrations = [];
        if (currentUser) {
            const { data: regs } = await supabaseClient
                .from('registrations')
                .select('group_id, event_id')
                .eq('user_id', currentUser.id);
            userRegistrations = regs || [];
        }
        
        // 渲染活动列表
        renderActivities(events, groups || [], userRegistrations);
        
    } catch (error) {
        console.error('加载活动失败:', error);
        activitiesGrid.innerHTML = '<div class="error-message">加载活动失败: ' + escapeHtml(error.message) + '</div>';
    }
}

function renderActivities(events, groups, userRegistrations) {
    activitiesGrid.innerHTML = '';

    events.forEach(event => {
        const eventGroups = groups.filter(g => g.event_id === event.id);
        if (eventGroups.length === 0) return;

        const eventCard = document.createElement('div');
        eventCard.className = 'activity-card';
        eventCard.innerHTML = `
            <div class="activity-date">
                <span class="date-day">${escapeHtml(event.title)}</span>
            </div>
            <h3>${escapeHtml(event.title)}</h3>
            ${event.description ? `<p>${escapeHtml(event.description)}</p>` : ''}
            <div class="activity-groups">
                ${eventGroups.map(group => {
                    const isRegistered = userRegistrations.some(r => r.group_id === group.id);
                    const isFull = group.claimed >= group.capacity;
                    const remaining = group.capacity - group.claimed;

                    let buttonClass = 'group-button available';
                    let buttonText = '立即报名';
                    let buttonDisabled = false;

                    if (isRegistered) {
                        buttonClass = 'group-button registered';
                        buttonText = '查看入场码';
                    } else if (isFull) {
                        buttonClass = 'group-button full';
                        buttonText = '已满';
                        buttonDisabled = true;
                    }

                    return `
                        <div class="group-item" style="margin-top: 1rem; padding: 1rem; background: #f5f5f5; border-radius: 8px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <strong>${escapeHtml(group.name)}</strong>
                                    <div class="group-info">剩余名额: ${parseInt(remaining, 10)}/${parseInt(group.capacity, 10)}</div>
                                </div>
                                <button
                                    class="${escapeHtml(buttonClass)}"
                                    data-group-id="${parseInt(group.id, 10)}"
                                    data-event-id="${parseInt(event.id, 10)}"
                                    ${buttonDisabled ? 'disabled' : ''}
                                    style="width: auto; padding: 8px 20px; margin: 0;">
                                    ${escapeHtml(buttonText)}
                                </button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        activitiesGrid.appendChild(eventCard);
    });
    
    // 绑定报名按钮事件
    document.querySelectorAll('.group-button').forEach(btn => {
        if (!btn.disabled) {
            btn.addEventListener('click', () => handleRegistration(btn));
        }
    });
}

// ==================== 活动报名 ====================
async function handleRegistration(button) {
    if (!currentUser) {
        alert('请先登录');
        showAuthModal();
        return;
    }
    
    const groupId = parseInt(button.dataset.groupId, 10);
    const eventId = parseInt(button.dataset.eventId, 10);
    
    // 检查是否已报名该活动的其他分组
    const { data: existingReg, error: checkError } = await supabaseClient
        .from('registrations')
        .select('*')
        .eq('user_id', currentUser.id)
        .eq('event_id', eventId)
        .maybeSingle();
    
    if (checkError) {
        console.error('检查报名记录失败:', checkError);
    }
    
    if (existingReg) {
        if (existingReg.group_id === groupId) {
            // 已报名该分组，显示入场码
            await showTicketInfo(groupId);
        } else {
            alert('您已报名该活动的其他分组，无法重复报名');
        }
        return;
    }
    
    // 调用后端 API 进行报名（处理并发）
    try {
        // 获取当前用户的 session token
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
            alert('登录已过期，请重新登录');
            showAuthModal();
            return;
        }

        const response = await fetch('/.netlify/functions/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                groupId: groupId,
                eventId: eventId
            })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || '报名失败');
        }
        
        if (result.success) {
            // 报名成功，显示签到二维码
            currentRegistration = result.registration;
            showCheckinModal(result.checkinImg);
        } else {
            alert(result.message || '报名失败');
        }
    } catch (error) {
        console.error('报名错误:', error);
        alert('报名失败: ' + error.message);
    }
}

// ==================== Modal 管理 ====================
function showCheckinModal(checkinImg) {
    const checkinQR = document.getElementById('checkinQR');
    // 安全地创建图片元素，防止 XSS
    checkinQR.innerHTML = '';
    const safeUrl = sanitizeImageUrl(checkinImg);
    if (safeUrl) {
        const img = document.createElement('img');
        img.src = safeUrl;
        img.alt = '签到二维码';
        checkinQR.appendChild(img);
    } else {
        checkinQR.textContent = '二维码加载失败';
    }
    checkinModal.classList.add('show');
}


async function showTicketInfo(groupId) {
    if (!supabaseClient) return;
    
    const { data: group, error } = await supabaseClient
        .from('event_groups')
        .select('share_link')
        .eq('id', groupId)
        .single();
    
    if (error) {
        console.error('获取领票链接失败:', error);
        return;
    }
    
    if (group && group.share_link) {
        ticketLink.href = group.share_link;
        ticketModal.classList.add('show');
    }
}


// 点击 Modal 外部关闭（在 bindEvents 中绑定）
function setupModalCloseOnOutsideClick() {
    window.addEventListener('click', (e) => {
        if (e.target === authModal) hideAuthModal();
        if (e.target === checkinModal) checkinModal.classList.remove('show');
        if (e.target === ticketModal) ticketModal.classList.remove('show');
    });
}

// ==================== 社务公示 ====================
async function fetchDashboardData() {
    if (!supabaseClient) return;
    
    try {
        // 获取财务数据
        const { data: financeRecords, error: financeError } = await supabaseClient
            .from('finance_records')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (financeError) throw financeError;
        
        let totalIncome = 0;
        let totalExpense = 0;
        
        financeRecords?.forEach(record => {
            if (record.type === 'income') {
                totalIncome += parseFloat(record.amount);
            } else {
                totalExpense += parseFloat(record.amount);
            }
        });
        
        document.getElementById('totalIncome').textContent = `¥${totalIncome.toFixed(2)}`;
        document.getElementById('totalExpense').textContent = `¥${totalExpense.toFixed(2)}`;
        document.getElementById('balance').textContent = `¥${(totalIncome - totalExpense).toFixed(2)}`;
        
        // 渲染财务流水
        const financeList = document.getElementById('financeList');
        if (financeRecords && financeRecords.length > 0) {
            financeList.innerHTML = financeRecords.map(record => {
                const description = escapeHtml(record.description || '无描述');
                const dateStr = escapeHtml(new Date(record.created_at).toLocaleDateString());
                const amount = parseFloat(record.amount).toFixed(2);
                const isIncome = record.type === 'income';
                return `
                    <div class="finance-record">
                        <div>
                            <div style="font-weight: 500;">${description}</div>
                            <div style="font-size: 0.9rem; color: #666;">${dateStr}</div>
                        </div>
                        <div style="font-weight: 700; color: ${isIncome ? '#4caf50' : '#f44336'};">
                            ${isIncome ? '+' : '-'}¥${amount}
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            financeList.innerHTML = '<div class="loading">暂无财务记录</div>';
        }
        
        // 获取物资数据
        const { data: inventory, error: inventoryError } = await supabaseClient
            .from('inventory')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (inventoryError) throw inventoryError;
        
        const inventoryList = document.getElementById('inventoryList');
        if (inventory && inventory.length > 0) {
            inventoryList.innerHTML = inventory.map(item => {
                const name = escapeHtml(item.name);
                const description = escapeHtml(item.description || '');
                const quantity = parseInt(item.quantity, 10);
                const unit = escapeHtml(item.unit || '件');
                return `
                    <div class="inventory-item">
                        <div>
                            <div class="inventory-item-name">${name}</div>
                            <div style="font-size: 0.9rem; color: #666;">${description}</div>
                        </div>
                        <div class="inventory-item-quantity">${quantity} ${unit}</div>
                    </div>
                `;
            }).join('');
        } else {
            inventoryList.innerHTML = '<div class="loading">暂无物资记录</div>';
        }
        
    } catch (error) {
        console.error('加载社务数据失败:', error);
    }
}

// ==================== 工具函数 ====================

// HTML 转义函数，防止 XSS 攻击
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

// 安全地设置图片 src（只允许 http/https/data URL）
function sanitizeImageUrl(url) {
    if (!url) return '';
    const trimmed = String(url).trim();
    // 只允许 http、https 和 data URL
    if (trimmed.startsWith('https://') || trimmed.startsWith('http://') || trimmed.startsWith('data:image/')) {
        return trimmed;
    }
    return '';
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    document.body.insertBefore(errorDiv, document.body.firstChild);
    setTimeout(() => errorDiv.remove(), 5000);
}

// ==================== 原有功能保留 ====================
// 移动端菜单切换
const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');

if (hamburger) {
    hamburger.addEventListener('click', () => {
        navMenu.classList.toggle('active');
        hamburger.classList.toggle('active');
    });
}

// 点击菜单项后关闭移动端菜单
document.querySelectorAll('.nav-menu a').forEach(link => {
    link.addEventListener('click', () => {
        navMenu.classList.remove('active');
        hamburger.classList.remove('active');
    });
});

// 平滑滚动
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            const offsetTop = target.offsetTop - 70;
            window.scrollTo({
                top: offsetTop,
                behavior: 'smooth'
            });
        }
    });
});

// 导航栏滚动效果
let lastScroll = 0;
const navbar = document.querySelector('.navbar');

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;
    
    if (currentScroll > 100) {
        navbar.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.2)';
    } else {
        navbar.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
    }
    
    lastScroll = currentScroll;
});

// 滚动动画
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// 观察所有卡片元素
document.addEventListener('DOMContentLoaded', () => {
    const cards = document.querySelectorAll('.feature-card, .activity-card, .member-card');
    cards.forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(30px)';
        card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(card);
    });
});

function bindEvents() {
    // 绑定登录按钮事件
    if (btnLogin) {
        btnLogin.addEventListener('click', () => {
            console.log('登录按钮被点击');
            isLoginMode = true;
            showAuthModal();
        });
        console.log('登录按钮事件已绑定');
    } else {
        console.error('登录按钮未找到！');
    }

    // 绑定退出按钮事件
    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            if (!supabaseClient) return;
            await supabaseClient.auth.signOut();
            currentUser = null;
            updateUserUI(false);
        });
    }

    // 绑定 Modal 关闭按钮事件
    if (closeAuthModal) {
        closeAuthModal.addEventListener('click', () => {
            hideAuthModal();
        });
    }

    // 绑定切换登录/注册模式
    if (authSwitchLink) {
        authSwitchLink.addEventListener('click', (e) => {
            e.preventDefault();
            isLoginMode = !isLoginMode;
            updateAuthModalMode();
        });
    }

    // 绑定签到确认按钮
    if (confirmCheckin) {
        confirmCheckin.addEventListener('click', async () => {
            checkinModal.classList.remove('show');
            
            // 获取领票链接
            if (currentRegistration && currentRegistration.groupId) {
                await showTicketInfo(currentRegistration.groupId);
            }
        });
    }

    // 绑定签到 Modal 关闭按钮
    if (closeCheckinModal) {
        closeCheckinModal.addEventListener('click', () => {
            checkinModal.classList.remove('show');
        });
    }

    // 绑定领票 Modal 关闭按钮
    if (closeTicketModal) {
        closeTicketModal.addEventListener('click', () => {
            ticketModal.classList.remove('show');
            // 刷新活动列表
            fetchActivities();
        });
    }

    // 绑定表单提交事件
    if (authForm) {
        authForm.addEventListener('submit', handleAuthSubmit);
    }
}

// 处理认证表单提交
async function handleAuthSubmit(e) {
    e.preventDefault();
    if (!supabaseClient) return;
    
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    
    try {
        if (isLoginMode) {
            // 登录
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email,
                password
            });
            
            if (error) throw error;
            
            hideAuthModal();
            await checkAuthState();
        } else {
            // 注册
            const name = document.getElementById('authName').value;
            const studentId = document.getElementById('authStudentId').value;
            const college = document.getElementById('authCollege').value;
            
            const { data, error } = await supabaseClient.auth.signUp({
                email,
                password
            });
            
            if (error) throw error;
            
            // 创建用户资料（通过后端 API，绕过 RLS）
            if (data.user && data.session) {
                try {
                    const profileResponse = await fetch('/.netlify/functions/create-profile', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${data.session.access_token}`
                        },
                        body: JSON.stringify({
                            realName: name,
                            studentId: studentId,
                            college: college,
                            email: email
                        })
                    });
                    
                    const profileResult = await profileResponse.json();
                    
                    if (!profileResponse.ok || !profileResult.success) {
                        console.error('创建用户资料失败:', profileResult);
                        // 不抛出错误，因为用户已经注册成功，资料可以后续补充
                        alert('注册成功，但用户资料创建失败，请稍后补充');
                    }
                } catch (profileError) {
                    console.error('创建用户资料时出错:', profileError);
                    // 不抛出错误，因为用户已经注册成功
                    alert('注册成功，但用户资料创建失败，请稍后补充');
                }
            }
            
            hideAuthModal();
            alert('注册成功！请检查邮箱验证链接（如已启用邮箱验证）');
            await checkAuthState();
        }
    } catch (error) {
        console.error('认证错误:', error);
        alert('操作失败: ' + error.message);
    }
}
