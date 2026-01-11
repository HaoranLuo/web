// 管理员后台 JavaScript
// 处理所有管理功能的逻辑

let supabaseClient;
let currentUser = null;
let currentAdminRole = null;
let config = null;

// 初始化
async function init() {
    try {
        // 加载配置
        await loadConfig();

        // 初始化 Supabase
        supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

        // 检查用户登录状态
        const { data: { session } } = await supabaseClient.auth.getSession();

        if (!session) {
            // 未登录，跳转到主页
            alert('请先登录');
            window.location.href = 'index.html';
            return;
        }

        currentUser = session.user;

        // 加载用户资料和管理员角色
        await loadUserProfile();
        await loadAdminRole();

        // 检查是否是管理员
        if (!currentAdminRole) {
            alert('您不是管理员，无法访问此页面');
            window.location.href = 'index.html';
            return;
        }

        // 显示用户信息
        displayUserInfo();

        // 根据角色显示标签页
        setupTabs();

        // 加载初始数据
        await loadInitialData();

    } catch (error) {
        console.error('初始化失败:', error);
        alert('初始化失败，请刷新页面重试');
    }
}

// 加载配置
async function loadConfig() {
    try {
        const response = await fetch('/.netlify/functions/config');
        config = await response.json();
    } catch (error) {
        console.error('加载配置失败:', error);
        throw error;
    }
}

// 加载用户资料
async function loadUserProfile() {
    const { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();

    if (error) {
        console.error('加载用户资料失败:', error);
        return;
    }

    currentUser.profile = data;
}

// 加载管理员角色
async function loadAdminRole() {
    const token = (await supabaseClient.auth.getSession()).data.session.access_token;

    try {
        const response = await fetch('/.netlify/functions/admin-roles', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.success) {
            currentAdminRole = {
                role: data.currentUserRole,
                roleName: data.currentUserRoleName
            };
        }
    } catch (error) {
        console.error('加载管理员角色失败:', error);
    }
}

// 显示用户信息
function displayUserInfo() {
    document.getElementById('userName').textContent = currentUser.profile?.real_name || '未知';
    document.getElementById('userRole').textContent = currentAdminRole?.roleName || '未知';
}

// 设置标签页
function setupTabs() {
    const tabsContainer = document.getElementById('tabsContainer');
    const tabs = [];

    // 社长可以看到所有标签
    if (currentAdminRole.role === 'president') {
        tabs.push(
            { id: 'approvalsTab', name: '待审批', icon: '📋' },
            { id: 'rolesTab', name: '角色管理', icon: '👥' },
            { id: 'eventsTab', name: '活动管理', icon: '🏸' },
            { id: 'financeTab', name: '财务管理', icon: '💰' },
            { id: 'inventoryTab', name: '物资管理', icon: '📦' }
        );
    }
    // 财务可以看到财务和物资
    else if (currentAdminRole.role === 'treasurer') {
        tabs.push(
            { id: 'financeTab', name: '财务管理', icon: '💰' },
            { id: 'inventoryTab', name: '物资管理', icon: '📦' },
            { id: 'myRequestsTab', name: '我的申请', icon: '📝' }
        );
    }
    // 副社长和活动部部长可以看到活动
    else if (['vice_president', 'activity_director'].includes(currentAdminRole.role)) {
        tabs.push(
            { id: 'eventsTab', name: '活动管理', icon: '🏸' },
            { id: 'myRequestsTab', name: '我的申请', icon: '📝' }
        );
    }
    // 指导老师只能查看
    else if (currentAdminRole.role === 'advisor') {
        tabs.push(
            { id: 'eventsTab', name: '活动查看', icon: '🏸' },
            { id: 'financeTab', name: '财务查看', icon: '💰' },
            { id: 'inventoryTab', name: '物资查看', icon: '📦' }
        );
    }

    // 渲染标签
    tabsContainer.innerHTML = tabs.map((tab, index) => `
        <button class="tab ${index === 0 ? 'active' : ''}" data-tab="${tab.id}">
            ${tab.icon} ${tab.name}
        </button>
    `).join('');

    // 添加点击事件
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // 显示第一个标签页的内容
    if (tabs.length > 0) {
        document.getElementById(tabs[0].id).classList.add('active');
    }
}

// 切换标签页
function switchTab(tabId) {
    // 更新标签状态
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');

    // 更新内容区域
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(tabId).classList.add('active');

    // 加载对应数据
    loadTabData(tabId);
}

// 加载标签页数据
async function loadTabData(tabId) {
    switch (tabId) {
        case 'approvalsTab':
            await loadPendingApprovals();
            break;
        case 'rolesTab':
            await loadAdminList();
            break;
        case 'eventsTab':
            await loadEventsList();
            break;
        case 'financeTab':
            await loadFinanceData();
            break;
        case 'inventoryTab':
            await loadInventoryData();
            break;
        case 'myRequestsTab':
            await loadMyRequests();
            break;
    }
}

// 加载初始数据
async function loadInitialData() {
    const firstTab = document.querySelector('.tab.active');
    if (firstTab) {
        await loadTabData(firstTab.dataset.tab);
    }
}

// ============================================================================
// 待审批管理（社长专用）
// ============================================================================

async function loadPendingApprovals() {
    const container = document.getElementById('pendingApprovals');
    const token = (await supabaseClient.auth.getSession()).data.session.access_token;

    try {
        const response = await fetch('/.netlify/functions/approvals?action=pending', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!data.success) {
            container.innerHTML = `<p style="color: red;">${data.error}</p>`;
            return;
        }

        if (data.requests.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>暂无待审批事项</p></div>';
            return;
        }

        // 渲染审批列表
        container.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th>申请类型</th>
                        <th>申请人</th>
                        <th>申请理由</th>
                        <th>申请时间</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.requests.map(request => `
                        <tr>
                            <td>${request.requestTypeName}</td>
                            <td>${request.requesterName}</td>
                            <td>${request.reason || '-'}</td>
                            <td>${new Date(request.createdAt).toLocaleString('zh-CN')}</td>
                            <td>
                                <button class="btn btn-success btn-sm" onclick="handleApproval(${request.id}, 'approve')">批准</button>
                                <button class="btn btn-danger btn-sm" onclick="handleApproval(${request.id}, 'reject')">拒绝</button>
                                <button class="btn btn-secondary btn-sm" onclick="showApprovalDetails(${JSON.stringify(request).replace(/"/g, '&quot;')})">详情</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

    } catch (error) {
        console.error('加载待审批列表失败:', error);
        container.innerHTML = '<p style="color: red;">加载失败，请刷新重试</p>';
    }
}

// 处理审批
async function handleApproval(requestId, action) {
    const actionText = action === 'approve' ? '批准' : '拒绝';
    const note = prompt(`请输入${actionText}备注（可选）：`);

    if (note === null) return; // 用户取消

    const token = (await supabaseClient.auth.getSession()).data.session.access_token;

    try {
        const response = await fetch('/.netlify/functions/approvals', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                requestId,
                action,
                approvalNote: note
            })
        });

        const data = await response.json();

        if (data.success) {
            alert(data.message);
            await loadPendingApprovals();
        } else {
            alert('操作失败：' + data.error);
        }

    } catch (error) {
        console.error('审批失败:', error);
        alert('操作失败，请重试');
    }
}

// 显示审批详情
function showApprovalDetails(request) {
    const modal = createModal('审批详情', `
        <div class="form-group">
            <label>申请类型：</label>
            <p>${request.requestTypeName}</p>
        </div>
        <div class="form-group">
            <label>申请人：</label>
            <p>${request.requesterName}</p>
        </div>
        <div class="form-group">
            <label>申请理由：</label>
            <p>${request.reason || '-'}</p>
        </div>
        <div class="form-group">
            <label>申请时间：</label>
            <p>${new Date(request.createdAt).toLocaleString('zh-CN')}</p>
        </div>
        <div class="form-group">
            <label>详细数据：</label>
            <pre style="background: #f5f5f5; padding: 10px; border-radius: 5px; overflow-x: auto;">${JSON.stringify(request.requestData, null, 2)}</pre>
        </div>
    `);
    showModal(modal);
}

// ============================================================================
// 角色管理（社长专用）
// ============================================================================

async function loadAdminList() {
    const container = document.getElementById('adminList');
    const token = (await supabaseClient.auth.getSession()).data.session.access_token;

    try {
        const response = await fetch('/.netlify/functions/admin-roles', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!data.success) {
            container.innerHTML = `<p style="color: red;">${data.error}</p>`;
            return;
        }

        if (data.admins.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>暂无管理员</p></div>';
            return;
        }

        // 渲染管理员列表
        container.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th>姓名</th>
                        <th>学号</th>
                        <th>角色</th>
                        <th>任命时间</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.admins.map(admin => `
                        <tr>
                            <td>${admin.profile.real_name}</td>
                            <td>${admin.profile.student_id}</td>
                            <td><span class="badge badge-primary">${admin.roleName}</span></td>
                            <td>${new Date(admin.appointedAt).toLocaleString('zh-CN')}</td>
                            <td>
                                ${admin.userId !== currentUser.id ? `
                                    <button class="btn btn-danger btn-sm" onclick="handleRevokeAdmin('${admin.userId}', '${admin.profile.real_name}')">撤销</button>
                                ` : '-'}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

    } catch (error) {
        console.error('加载管理员列表失败:', error);
        container.innerHTML = '<p style="color: red;">加载失败，请刷新重试</p>';
    }
}

// 显示任命管理员模态框
async function showAppointModal() {
    // 获取所有用户列表
    const { data: users, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .order('real_name');

    if (error) {
        alert('获取用户列表失败');
        return;
    }

    const modal = createModal('任命管理员', `
        <form id="appointForm">
            <div class="form-group">
                <label>选择用户：</label>
                <select name="targetUserId" required>
                    <option value="">请选择...</option>
                    ${users.map(user => `
                        <option value="${user.id}">${user.real_name} (${user.student_id})</option>
                    `).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>选择角色：</label>
                <select name="role" required>
                    <option value="">请选择...</option>
                    <option value="president">社长</option>
                    <option value="treasurer">财务</option>
                    <option value="vice_president">副社长</option>
                    <option value="activity_director">活动部部长</option>
                    <option value="advisor">指导老师</option>
                </select>
            </div>
            <button type="submit" class="btn btn-primary">确认任命</button>
        </form>
    `);

    showModal(modal);

    // 处理表单提交
    document.getElementById('appointForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        await handleAppointAdmin(Object.fromEntries(formData));
        closeModal(modal);
    });
}

// 任命管理员
async function handleAppointAdmin(data) {
    const token = (await supabaseClient.auth.getSession()).data.session.access_token;

    try {
        const response = await fetch('/.netlify/functions/admin-roles', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            alert(result.message);
            await loadAdminList();
        } else {
            alert('操作失败：' + result.error);
        }

    } catch (error) {
        console.error('任命管理员失败:', error);
        alert('操作失败，请重试');
    }
}

// 撤销管理员
async function handleRevokeAdmin(targetUserId, userName) {
    if (!confirm(`确定要撤销 ${userName} 的管理员职位吗？`)) {
        return;
    }

    const token = (await supabaseClient.auth.getSession()).data.session.access_token;

    try {
        const response = await fetch('/.netlify/functions/admin-roles', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ targetUserId })
        });

        const result = await response.json();

        if (result.success) {
            alert(result.message);
            await loadAdminList();
        } else {
            alert('操作失败：' + result.error);
        }

    } catch (error) {
        console.error('撤销管理员失败:', error);
        alert('操作失败，请重试');
    }
}

// ============================================================================
// 活动管理
// ============================================================================

async function loadEventsList() {
    const container = document.getElementById('eventsList');
    const token = (await supabaseClient.auth.getSession()).data.session.access_token;

    try {
        const response = await fetch('/.netlify/functions/admin-events', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!data.success) {
            container.innerHTML = `<p style="color: red;">${data.error}</p>`;
            return;
        }

        if (data.events.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>暂无活动</p></div>';
            return;
        }

        // 渲染活动列表
        container.innerHTML = data.events.map(event => `
            <div class="card">
                <h4>${event.title} <span class="badge ${event.status === 'open' ? 'badge-open' : 'badge-ended'}">${event.status === 'open' ? '进行中' : '已结束'}</span></h4>
                <p><strong>类型：</strong>${getEventTypeName(event.type)}</p>
                <p><strong>描述：</strong>${event.description || '-'}</p>
                <p><strong>创建时间：</strong>${new Date(event.created_at).toLocaleString('zh-CN')}</p>
                <p><strong>分组数：</strong>${event.event_groups?.length || 0}</p>
                ${currentAdminRole.role === 'president' ? `
                    <button class="btn btn-primary btn-sm" onclick="handleEditEvent(${event.id})">编辑</button>
                    <button class="btn btn-danger btn-sm" onclick="handleDeleteEvent(${event.id}, '${event.title}')">删除</button>
                ` : ''}
            </div>
        `).join('');

    } catch (error) {
        console.error('加载活动列表失败:', error);
        container.innerHTML = '<p style="color: red;">加载失败，请刷新重试</p>';
    }
}

function getEventTypeName(type) {
    const types = {
        'group_play': '周常群打',
        'competition': '比赛',
        'other': '其他'
    };
    return types[type] || type;
}

// 显示创建活动模态框
function showCreateEventModal() {
    const modal = createModal('创建活动', `
        <form id="createEventForm">
            <div class="form-group">
                <label>活动标题：</label>
                <input type="text" name="title" required>
            </div>
            <div class="form-group">
                <label>活动类型：</label>
                <select name="type" required>
                    <option value="group_play">周常群打</option>
                    <option value="competition">比赛</option>
                    <option value="other">其他</option>
                </select>
            </div>
            <div class="form-group">
                <label>活动描述：</label>
                <textarea name="description"></textarea>
            </div>
            <div class="form-group">
                <label>活动状态：</label>
                <select name="status">
                    <option value="open">开放</option>
                    <option value="ended">已结束</option>
                </select>
            </div>
            <div class="form-group">
                <label>报名链接（比赛专用）：</label>
                <input type="url" name="registrationLink">
            </div>
            <button type="submit" class="btn btn-primary">创建活动</button>
        </form>
    `);

    showModal(modal);

    // 处理表单提交
    document.getElementById('createEventForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData);
        await handleCreateEvent(data);
        closeModal(modal);
    });
}

// 创建活动
async function handleCreateEvent(data) {
    const token = (await supabaseClient.auth.getSession()).data.session.access_token;

    try {
        const response = await fetch('/.netlify/functions/admin-events', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            alert(result.needsApproval ? result.message : '活动创建成功');
            await loadEventsList();
        } else {
            alert('操作失败：' + result.error);
        }

    } catch (error) {
        console.error('创建活动失败:', error);
        alert('操作失败，请重试');
    }
}

// 编辑活动
async function handleEditEvent(eventId) {
    alert('编辑功能开发中...');
}

// 删除活动
async function handleDeleteEvent(eventId, title) {
    if (!confirm(`确定要删除活动 "${title}" 吗？此操作不可撤销！`)) {
        return;
    }

    const token = (await supabaseClient.auth.getSession()).data.session.access_token;

    try {
        const response = await fetch('/.netlify/functions/admin-events', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ eventId })
        });

        const result = await response.json();

        if (result.success) {
            alert(result.needsApproval ? result.message : '活动删除成功');
            await loadEventsList();
        } else {
            alert('操作失败：' + result.error);
        }

    } catch (error) {
        console.error('删除活动失败:', error);
        alert('操作失败，请重试');
    }
}

// ============================================================================
// 财务管理
// ============================================================================

async function loadFinanceData() {
    await loadFinanceSummary();
    await loadFinanceRecords();
}

async function loadFinanceSummary() {
    const token = (await supabaseClient.auth.getSession()).data.session.access_token;

    try {
        const response = await fetch('/.netlify/functions/admin-finance?action=summary', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.success) {
            document.getElementById('totalIncome').textContent = `¥${data.summary.income.toFixed(2)}`;
            document.getElementById('totalExpense').textContent = `¥${data.summary.expense.toFixed(2)}`;
            document.getElementById('totalBalance').textContent = `¥${data.summary.balance.toFixed(2)}`;
        }

    } catch (error) {
        console.error('加载财务汇总失败:', error);
    }
}

async function loadFinanceRecords() {
    const container = document.getElementById('financeList');
    const token = (await supabaseClient.auth.getSession()).data.session.access_token;

    try {
        const response = await fetch('/.netlify/functions/admin-finance', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!data.success) {
            container.innerHTML = `<p style="color: red;">${data.error}</p>`;
            return;
        }

        if (data.records.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>暂无财务记录</p></div>';
            return;
        }

        // 渲染财务记录
        container.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th>类型</th>
                        <th>金额</th>
                        <th>描述</th>
                        <th>记录人</th>
                        <th>状态</th>
                        <th>时间</th>
                        ${currentAdminRole.role === 'president' ? '<th>操作</th>' : ''}
                    </tr>
                </thead>
                <tbody>
                    ${data.records.map(record => `
                        <tr>
                            <td>${record.type === 'income' ? '收入' : '支出'}</td>
                            <td style="color: ${record.type === 'income' ? 'green' : 'red'};">¥${record.amount}</td>
                            <td>${record.description}</td>
                            <td>${record.recorder?.real_name || '-'}</td>
                            <td><span class="badge ${record.approved ? 'badge-approved' : 'badge-pending'}">${record.approved ? '已批准' : '待审批'}</span></td>
                            <td>${new Date(record.created_at).toLocaleString('zh-CN')}</td>
                            ${currentAdminRole.role === 'president' ? `
                                <td>
                                    <button class="btn btn-danger btn-sm" onclick="handleDeleteFinance(${record.id})">删除</button>
                                </td>
                            ` : ''}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

    } catch (error) {
        console.error('加载财务记录失败:', error);
        container.innerHTML = '<p style="color: red;">加载失败，请刷新重试</p>';
    }
}

// 显示添加财务记录模态框
function showAddFinanceModal() {
    const modal = createModal('添加财务记录', `
        <form id="addFinanceForm">
            <div class="form-group">
                <label>类型：</label>
                <select name="type" required>
                    <option value="income">收入</option>
                    <option value="expense">支出</option>
                </select>
            </div>
            <div class="form-group">
                <label>金额：</label>
                <input type="number" name="amount" step="0.01" min="0.01" required>
            </div>
            <div class="form-group">
                <label>描述：</label>
                <textarea name="description" required></textarea>
            </div>
            <div class="form-group">
                <label>备注：</label>
                <textarea name="notes"></textarea>
            </div>
            <button type="submit" class="btn btn-primary">提交</button>
        </form>
    `);

    showModal(modal);

    // 处理表单提交
    document.getElementById('addFinanceForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData);
        data.amount = parseFloat(data.amount);
        await handleAddFinance(data);
        closeModal(modal);
    });
}

// 添加财务记录
async function handleAddFinance(data) {
    const token = (await supabaseClient.auth.getSession()).data.session.access_token;

    try {
        const response = await fetch('/.netlify/functions/admin-finance', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            alert(result.needsApproval ? result.message : '财务记录添加成功');
            await loadFinanceData();
        } else {
            alert('操作失败：' + result.error);
        }

    } catch (error) {
        console.error('添加财务记录失败:', error);
        alert('操作失败，请重试');
    }
}

// 删除财务记录
async function handleDeleteFinance(recordId) {
    if (!confirm('确定要删除这条财务记录吗？')) {
        return;
    }

    const token = (await supabaseClient.auth.getSession()).data.session.access_token;

    try {
        const response = await fetch('/.netlify/functions/admin-finance', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ recordId })
        });

        const result = await response.json();

        if (result.success) {
            alert(result.message);
            await loadFinanceData();
        } else {
            alert('操作失败：' + result.error);
        }

    } catch (error) {
        console.error('删除财务记录失败:', error);
        alert('操作失败，请重试');
    }
}

// ============================================================================
// 物资管理
// ============================================================================

async function loadInventoryData() {
    const container = document.getElementById('inventoryList');
    const token = (await supabaseClient.auth.getSession()).data.session.access_token;

    try {
        const response = await fetch('/.netlify/functions/admin-inventory', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!data.success) {
            container.innerHTML = `<p style="color: red;">${data.error}</p>`;
            return;
        }

        if (data.items.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>暂无物资</p></div>';
            return;
        }

        // 渲染物资列表
        container.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th>名称</th>
                        <th>类别</th>
                        <th>数量</th>
                        <th>单位</th>
                        <th>单价</th>
                        <th>状态</th>
                        <th>最后修改人</th>
                        ${currentAdminRole.role === 'president' ? '<th>操作</th>' : ''}
                    </tr>
                </thead>
                <tbody>
                    ${data.items.map(item => `
                        <tr>
                            <td>${item.name}</td>
                            <td>${item.category === 'fixed_asset' ? '固定资产' : '消耗品'}</td>
                            <td>${item.quantity}</td>
                            <td>${item.unit}</td>
                            <td>${item.price ? '¥' + item.price : '-'}</td>
                            <td><span class="badge ${item.approved ? 'badge-approved' : 'badge-pending'}">${item.approved ? '已批准' : '待审批'}</span></td>
                            <td>${item.modifier?.real_name || '-'}</td>
                            ${currentAdminRole.role === 'president' ? `
                                <td>
                                    <button class="btn btn-danger btn-sm" onclick="handleDeleteInventory(${item.id})">删除</button>
                                </td>
                            ` : ''}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

    } catch (error) {
        console.error('加载物资列表失败:', error);
        container.innerHTML = '<p style="color: red;">加载失败，请刷新重试</p>';
    }
}

// 显示添加物资模态框
function showAddInventoryModal() {
    const modal = createModal('添加物资', `
        <form id="addInventoryForm">
            <div class="form-group">
                <label>名称：</label>
                <input type="text" name="name" required>
            </div>
            <div class="form-group">
                <label>类别：</label>
                <select name="category" required>
                    <option value="fixed_asset">固定资产</option>
                    <option value="consumable">消耗品</option>
                </select>
            </div>
            <div class="form-group">
                <label>数量：</label>
                <input type="number" name="quantity" min="0" value="0" required>
            </div>
            <div class="form-group">
                <label>单位：</label>
                <input type="text" name="unit" required placeholder="例如：个、支、套">
            </div>
            <div class="form-group">
                <label>单价：</label>
                <input type="number" name="price" step="0.01" min="0">
            </div>
            <div class="form-group">
                <label>购买日期：</label>
                <input type="date" name="purchaseDate">
            </div>
            <div class="form-group">
                <label>描述：</label>
                <textarea name="description"></textarea>
            </div>
            <button type="submit" class="btn btn-primary">提交</button>
        </form>
    `);

    showModal(modal);

    // 处理表单提交
    document.getElementById('addInventoryForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData);
        if (data.quantity) data.quantity = parseInt(data.quantity);
        if (data.price) data.price = parseFloat(data.price);
        await handleAddInventory(data);
        closeModal(modal);
    });
}

// 添加物资
async function handleAddInventory(data) {
    const token = (await supabaseClient.auth.getSession()).data.session.access_token;

    try {
        const response = await fetch('/.netlify/functions/admin-inventory', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            alert(result.needsApproval ? result.message : '物资添加成功');
            await loadInventoryData();
        } else {
            alert('操作失败：' + result.error);
        }

    } catch (error) {
        console.error('添加物资失败:', error);
        alert('操作失败，请重试');
    }
}

// 删除物资
async function handleDeleteInventory(itemId) {
    if (!confirm('确定要删除这个物资吗？')) {
        return;
    }

    const token = (await supabaseClient.auth.getSession()).data.session.access_token;

    try {
        const response = await fetch('/.netlify/functions/admin-inventory', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ itemId })
        });

        const result = await response.json();

        if (result.success) {
            alert(result.message);
            await loadInventoryData();
        } else {
            alert('操作失败：' + result.error);
        }

    } catch (error) {
        console.error('删除物资失败:', error);
        alert('操作失败，请重试');
    }
}

// ============================================================================
// 我的申请
// ============================================================================

async function loadMyRequests() {
    const container = document.getElementById('myRequestsList');
    const token = (await supabaseClient.auth.getSession()).data.session.access_token;

    try {
        const response = await fetch('/.netlify/functions/approvals', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!data.success) {
            container.innerHTML = `<p style="color: red;">${data.error}</p>`;
            return;
        }

        if (data.requests.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>暂无申请记录</p></div>';
            return;
        }

        // 渲染申请列表
        container.innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th>申请类型</th>
                        <th>状态</th>
                        <th>申请理由</th>
                        <th>审批人</th>
                        <th>审批备注</th>
                        <th>申请时间</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.requests.map(request => `
                        <tr>
                            <td>${request.requestTypeName}</td>
                            <td><span class="badge badge-${request.status}">${getStatusText(request.status)}</span></td>
                            <td>${request.reason || '-'}</td>
                            <td>${request.approverName || '-'}</td>
                            <td>${request.approvalNote || '-'}</td>
                            <td>${new Date(request.createdAt).toLocaleString('zh-CN')}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

    } catch (error) {
        console.error('加载申请列表失败:', error);
        container.innerHTML = '<p style="color: red;">加载失败，请刷新重试</p>';
    }
}

function getStatusText(status) {
    const statusMap = {
        'pending': '待审批',
        'approved': '已批准',
        'rejected': '已拒绝'
    };
    return statusMap[status] || status;
}

// ============================================================================
// 模态框工具函数
// ============================================================================

function createModal(title, content) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>${title}</h3>
                <span class="close" onclick="closeModal(this.closest('.modal'))">&times;</span>
            </div>
            <div class="modal-body">
                ${content}
            </div>
        </div>
    `;
    document.getElementById('modalsContainer').appendChild(modal);
    return modal;
}

function showModal(modal) {
    modal.classList.add('show');
}

function closeModal(modal) {
    modal.classList.remove('show');
    setTimeout(() => modal.remove(), 300);
}

// ============================================================================
// 退出登录
// ============================================================================

async function handleLogout() {
    if (confirm('确定要退出登录吗？')) {
        await supabaseClient.auth.signOut();
        window.location.href = 'index.html';
    }
}

// 页面加载时初始化
window.addEventListener('DOMContentLoaded', init);
