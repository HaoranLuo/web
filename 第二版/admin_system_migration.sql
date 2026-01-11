-- ====================================================================
-- 管理员系统数据库迁移脚本
-- 功能：添加管理员角色、权限管理、审批流程等
-- ====================================================================

-- ====================================================================
-- 1. 管理员角色表
-- ====================================================================
CREATE TABLE IF NOT EXISTS admin_roles (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role TEXT NOT NULL CHECK (role IN (
        'president',          -- 社长
        'treasurer',          -- 财务
        'vice_president',     -- 副社长
        'activity_director',  -- 活动部部长
        'advisor'             -- 指导老师
    )),
    appointed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- 任命人（通常是社长）
    appointed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,  -- 是否在职
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- 确保一个用户只能有一个活跃的角色
    UNIQUE(user_id, is_active) WHERE is_active = TRUE
);

-- 索引
CREATE INDEX idx_admin_roles_user_id ON admin_roles(user_id);
CREATE INDEX idx_admin_roles_role ON admin_roles(role);
CREATE INDEX idx_admin_roles_is_active ON admin_roles(is_active);

-- 自动更新时间戳
CREATE TRIGGER update_admin_roles_updated_at
    BEFORE UPDATE ON admin_roles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE admin_roles IS '管理员角色表，记录用户的管理员身份';
COMMENT ON COLUMN admin_roles.role IS '角色类型：president(社长)/treasurer(财务)/vice_president(副社长)/activity_director(活动部部长)/advisor(指导老师)';

-- ====================================================================
-- 2. 审批请求表
-- ====================================================================
CREATE TABLE IF NOT EXISTS approval_requests (
    id BIGSERIAL PRIMARY KEY,
    request_type TEXT NOT NULL CHECK (request_type IN (
        'finance_add',        -- 添加财务记录
        'finance_edit',       -- 编辑财务记录
        'finance_delete',     -- 删除财务记录
        'inventory_add',      -- 添加物资
        'inventory_edit',     -- 编辑物资
        'inventory_delete',   -- 删除物资
        'event_create',       -- 创建活动
        'event_edit',         -- 编辑活动
        'event_delete'        -- 删除活动
    )),
    requester_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,  -- 申请人
    approver_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,           -- 审批人
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    request_data JSONB NOT NULL,          -- 请求的具体数据（JSON格式）
    reason TEXT,                          -- 申请理由
    approval_note TEXT,                   -- 审批备注
    target_id BIGINT,                     -- 目标记录ID（如果是编辑/删除操作）
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    approved_at TIMESTAMP WITH TIME ZONE  -- 审批时间
);

-- 索引
CREATE INDEX idx_approval_requests_requester_id ON approval_requests(requester_id);
CREATE INDEX idx_approval_requests_approver_id ON approval_requests(approver_id);
CREATE INDEX idx_approval_requests_status ON approval_requests(status);
CREATE INDEX idx_approval_requests_request_type ON approval_requests(request_type);

-- 自动更新时间戳
CREATE TRIGGER update_approval_requests_updated_at
    BEFORE UPDATE ON approval_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE approval_requests IS '审批请求表，记录需要社长审批的操作';
COMMENT ON COLUMN approval_requests.request_data IS '请求的具体数据，JSON格式存储操作详情';

-- ====================================================================
-- 3. 修改现有表 - events 表
-- ====================================================================

-- 添加活动类型和审批相关字段
ALTER TABLE events
    ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'group_play' CHECK (type IN (
        'group_play',      -- 周常群打活动
        'competition',     -- 比赛活动
        'other'            -- 其他活动
    )),
    ADD COLUMN IF NOT EXISTS registration_link TEXT,  -- 报名链接（用于比赛）
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT FALSE,  -- 是否需要审批
    ADD COLUMN IF NOT EXISTS approval_request_id BIGINT REFERENCES approval_requests(id) ON DELETE SET NULL;

-- 索引
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_created_by ON events(created_by);
CREATE INDEX IF NOT EXISTS idx_events_approval_request_id ON events(approval_request_id);

COMMENT ON COLUMN events.type IS '活动类型：group_play(周常群打)/competition(比赛)/other(其他)';
COMMENT ON COLUMN events.registration_link IS '比赛报名链接';
COMMENT ON COLUMN events.requires_approval IS '是否需要社长审批';

-- ====================================================================
-- 4. 修改现有表 - event_groups 表
-- ====================================================================

-- 添加票的概念（每个分组可以有多张票）
ALTER TABLE event_groups
    ADD COLUMN IF NOT EXISTS ticket_count INTEGER DEFAULT 1 CHECK (ticket_count > 0),  -- 票的数量
    ADD COLUMN IF NOT EXISTS capacity_per_ticket INTEGER CHECK (capacity_per_ticket > 0);  -- 每张票的容量

-- 更新现有记录，使其兼容新字段
UPDATE event_groups SET capacity_per_ticket = capacity WHERE capacity_per_ticket IS NULL;

COMMENT ON COLUMN event_groups.ticket_count IS '该分组的票数（例如：新手场有4张票）';
COMMENT ON COLUMN event_groups.capacity_per_ticket IS '每张票的容量（例如：每张票7人）';

-- ====================================================================
-- 5. 创建活动票表（用于周常群打活动的多票管理）
-- ====================================================================
CREATE TABLE IF NOT EXISTS event_tickets (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT REFERENCES event_groups(id) ON DELETE CASCADE NOT NULL,
    ticket_number INTEGER NOT NULL,  -- 票号（1、2、3、4...）
    capacity INTEGER NOT NULL CHECK (capacity > 0),  -- 该票的容量
    claimed INTEGER DEFAULT 0 CHECK (claimed >= 0 AND claimed <= capacity),  -- 已领取人数
    qr_code_url TEXT,  -- 该票的二维码URL（可选，如果每张票有不同的二维码）
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(group_id, ticket_number)
);

-- 索引
CREATE INDEX idx_event_tickets_group_id ON event_tickets(group_id);

-- 自动更新时间戳
CREATE TRIGGER update_event_tickets_updated_at
    BEFORE UPDATE ON event_tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE event_tickets IS '活动票表，用于周常群打活动的多票管理';
COMMENT ON COLUMN event_tickets.ticket_number IS '票号，例如新手场的第1、2、3、4张票';

-- ====================================================================
-- 6. 修改报名表，支持选择具体的票
-- ====================================================================
ALTER TABLE registrations
    ADD COLUMN IF NOT EXISTS ticket_id BIGINT REFERENCES event_tickets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_registrations_ticket_id ON registrations(ticket_id);

COMMENT ON COLUMN registrations.ticket_id IS '用户报名时选择的具体票ID（用于多票活动）';

-- ====================================================================
-- 7. 修改现有表 - finance_records 表
-- ====================================================================

ALTER TABLE finance_records
    ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS approval_request_id BIGINT REFERENCES approval_requests(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS approved BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS notes TEXT;  -- 备注信息

-- 索引
CREATE INDEX IF NOT EXISTS idx_finance_records_recorded_by ON finance_records(recorded_by);
CREATE INDEX IF NOT EXISTS idx_finance_records_approval_request_id ON finance_records(approval_request_id);
CREATE INDEX IF NOT EXISTS idx_finance_records_approved ON finance_records(approved);

COMMENT ON COLUMN finance_records.recorded_by IS '记录人（财务）';
COMMENT ON COLUMN finance_records.approval_request_id IS '关联的审批请求ID';
COMMENT ON COLUMN finance_records.approved IS '是否已被社长批准';

-- ====================================================================
-- 8. 修改现有表 - inventory 表
-- ====================================================================

ALTER TABLE inventory
    ADD COLUMN IF NOT EXISTS last_modified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS approval_request_id BIGINT REFERENCES approval_requests(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS approved BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS purchase_date DATE,  -- 购买日期
    ADD COLUMN IF NOT EXISTS price DECIMAL(10,2);  -- 单价

-- 索引
CREATE INDEX IF NOT EXISTS idx_inventory_last_modified_by ON inventory(last_modified_by);
CREATE INDEX IF NOT EXISTS idx_inventory_approval_request_id ON inventory(approval_request_id);
CREATE INDEX IF NOT EXISTS idx_inventory_approved ON inventory(approved);

COMMENT ON COLUMN inventory.last_modified_by IS '最后修改人（财务）';
COMMENT ON COLUMN inventory.approval_request_id IS '关联的审批请求ID';
COMMENT ON COLUMN inventory.approved IS '是否已被社长批准';

-- ====================================================================
-- 9. 触发器：自动创建票（当创建分组时）
-- ====================================================================
CREATE OR REPLACE FUNCTION auto_create_tickets()
RETURNS TRIGGER AS $$
BEGIN
    -- 如果是周常群打活动且有票数配置，自动创建票
    IF NEW.ticket_count > 0 AND NEW.capacity_per_ticket IS NOT NULL THEN
        FOR i IN 1..NEW.ticket_count LOOP
            INSERT INTO event_tickets (group_id, ticket_number, capacity, qr_code_url)
            VALUES (NEW.id, i, NEW.capacity_per_ticket, NEW.checkin_img);
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_create_tickets
    AFTER INSERT ON event_groups
    FOR EACH ROW
    EXECUTE FUNCTION auto_create_tickets();

-- ====================================================================
-- 10. 触发器：票的库存管理（类似 update_group_claimed_safe）
-- ====================================================================
CREATE OR REPLACE FUNCTION update_ticket_claimed_safe()
RETURNS TRIGGER AS $$
DECLARE
    current_ticket RECORD;
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- 报名时，锁定票并检查容量
        IF NEW.ticket_id IS NOT NULL THEN
            SELECT * INTO current_ticket
            FROM event_tickets
            WHERE id = NEW.ticket_id
            FOR UPDATE;

            IF current_ticket.claimed >= current_ticket.capacity THEN
                RAISE EXCEPTION '该票名额已满';
            END IF;

            UPDATE event_tickets
            SET claimed = claimed + 1
            WHERE id = NEW.ticket_id;
        END IF;

    ELSIF TG_OP = 'DELETE' THEN
        -- 取消报名时，释放票名额
        IF OLD.ticket_id IS NOT NULL THEN
            UPDATE event_tickets
            SET claimed = claimed - 1
            WHERE id = OLD.ticket_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 删除旧触发器，创建新的（确保幂等性）
DROP TRIGGER IF EXISTS trigger_update_ticket_claimed ON registrations;
CREATE TRIGGER trigger_update_ticket_claimed
    AFTER INSERT OR DELETE ON registrations
    FOR EACH ROW
    EXECUTE FUNCTION update_ticket_claimed_safe();

-- ====================================================================
-- 11. RLS 策略 - admin_roles 表
-- ====================================================================

ALTER TABLE admin_roles ENABLE ROW LEVEL SECURITY;

-- 管理员可以查看所有角色
CREATE POLICY "Admins can view all roles"
    ON admin_roles FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM admin_roles ar
            WHERE ar.user_id = auth.uid() AND ar.is_active = TRUE
        )
    );

-- 社长可以任免管理员
CREATE POLICY "President can manage admin roles"
    ON admin_roles FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM admin_roles ar
            WHERE ar.user_id = auth.uid()
            AND ar.role = 'president'
            AND ar.is_active = TRUE
        )
    );

-- ====================================================================
-- 12. RLS 策略 - approval_requests 表
-- ====================================================================

ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;

-- 申请人可以查看自己的申请
CREATE POLICY "Users can view own requests"
    ON approval_requests FOR SELECT
    USING (requester_id = auth.uid());

-- 社长可以查看所有待审批的请求
CREATE POLICY "President can view all requests"
    ON approval_requests FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM admin_roles ar
            WHERE ar.user_id = auth.uid()
            AND ar.role = 'president'
            AND ar.is_active = TRUE
        )
    );

-- 管理员可以创建审批请求
CREATE POLICY "Admins can create requests"
    ON approval_requests FOR INSERT
    WITH CHECK (
        requester_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM admin_roles ar
            WHERE ar.user_id = auth.uid() AND ar.is_active = TRUE
        )
    );

-- 社长可以审批请求
CREATE POLICY "President can update requests"
    ON approval_requests FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM admin_roles ar
            WHERE ar.user_id = auth.uid()
            AND ar.role = 'president'
            AND ar.is_active = TRUE
        )
    );

-- ====================================================================
-- 13. RLS 策略 - event_tickets 表
-- ====================================================================

ALTER TABLE event_tickets ENABLE ROW LEVEL SECURITY;

-- 所有人都可以查看票信息
CREATE POLICY "Anyone can view tickets"
    ON event_tickets FOR SELECT
    USING (true);

-- 管理员可以管理票
CREATE POLICY "Admins can manage tickets"
    ON event_tickets FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM admin_roles ar
            WHERE ar.user_id = auth.uid() AND ar.is_active = TRUE
        )
    );

-- ====================================================================
-- 14. 更新现有表的 RLS 策略
-- ====================================================================

-- 更新 events 表 RLS：管理员可以创建和管理活动
DROP POLICY IF EXISTS "Admins can manage events" ON events;
CREATE POLICY "Admins can manage events"
    ON events FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM admin_roles ar
            WHERE ar.user_id = auth.uid()
            AND ar.is_active = TRUE
            AND ar.role IN ('president', 'vice_president', 'activity_director')
        )
    );

-- 更新 finance_records 表 RLS：财务可以创建记录
DROP POLICY IF EXISTS "Treasurer can manage finance" ON finance_records;
CREATE POLICY "Treasurer can manage finance"
    ON finance_records FOR INSERT
    WITH CHECK (
        recorded_by = auth.uid() AND
        EXISTS (
            SELECT 1 FROM admin_roles ar
            WHERE ar.user_id = auth.uid()
            AND ar.role = 'treasurer'
            AND ar.is_active = TRUE
        )
    );

-- 更新 inventory 表 RLS：财务可以管理物资
DROP POLICY IF EXISTS "Treasurer can manage inventory" ON inventory;
CREATE POLICY "Treasurer can manage inventory"
    ON inventory FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM admin_roles ar
            WHERE ar.user_id = auth.uid()
            AND ar.role = 'treasurer'
            AND ar.is_active = TRUE
        )
    );

-- ====================================================================
-- 15. 辅助函数：检查用户是否是管理员
-- ====================================================================
CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM admin_roles
        WHERE admin_roles.user_id = $1 AND is_active = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ====================================================================
-- 16. 辅助函数：检查用户是否是社长
-- ====================================================================
CREATE OR REPLACE FUNCTION is_president(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM admin_roles
        WHERE admin_roles.user_id = $1
        AND role = 'president'
        AND is_active = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ====================================================================
-- 17. 辅助函数：获取用户的管理员角色
-- ====================================================================
CREATE OR REPLACE FUNCTION get_user_admin_role(user_id UUID)
RETURNS TEXT AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role
    FROM admin_roles
    WHERE admin_roles.user_id = $1 AND is_active = TRUE
    LIMIT 1;

    RETURN user_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ====================================================================
-- 18. 视图：活动统计（用于管理后台）
-- ====================================================================
CREATE OR REPLACE VIEW event_statistics AS
SELECT
    e.id AS event_id,
    e.title,
    e.type,
    e.status,
    COUNT(DISTINCT eg.id) AS group_count,
    COUNT(DISTINCT r.id) AS registration_count,
    SUM(eg.capacity) AS total_capacity,
    SUM(eg.claimed) AS total_claimed
FROM events e
LEFT JOIN event_groups eg ON e.id = eg.event_id
LEFT JOIN registrations r ON e.id = r.event_id
GROUP BY e.id, e.title, e.type, e.status;

COMMENT ON VIEW event_statistics IS '活动统计视图，用于管理后台展示';

-- ====================================================================
-- 19. 视图：财务汇总（用于管理后台）
-- ====================================================================
CREATE OR REPLACE VIEW finance_summary AS
SELECT
    type,
    COUNT(*) AS record_count,
    SUM(amount) AS total_amount,
    AVG(amount) AS avg_amount
FROM finance_records
WHERE approved = TRUE
GROUP BY type;

COMMENT ON VIEW finance_summary IS '财务汇总视图，仅统计已批准的记录';

-- ====================================================================
-- 20. 视图：待审批请求汇总
-- ====================================================================
CREATE OR REPLACE VIEW pending_approvals_summary AS
SELECT
    request_type,
    COUNT(*) AS pending_count,
    MIN(created_at) AS oldest_request,
    MAX(created_at) AS newest_request
FROM approval_requests
WHERE status = 'pending'
GROUP BY request_type;

COMMENT ON VIEW pending_approvals_summary IS '待审批请求汇总，帮助社长了解待办事项';

-- ====================================================================
-- 完成
-- ====================================================================
-- 数据库迁移完成！
-- 下一步：创建 Netlify Functions API 来支持管理员操作
