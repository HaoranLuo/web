-- 修复 profile 插入问题
-- 方法 1：使用数据库触发器自动创建 profile（推荐）
-- 在 Supabase SQL Editor 中执行此脚本

-- 创建函数：当新用户注册时自动创建 profile
create or replace function public.handle_new_user()
returns trigger as $$
begin
  -- 注意：这里只创建基础结构，详细信息需要用户后续填写
  -- 如果需要在注册时就收集信息，请使用方法 2
  insert into public.profiles (id, real_name, student_id, college, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'real_name', ''),
    coalesce(new.raw_user_meta_data->>'student_id', ''),
    coalesce(new.raw_user_meta_data->>'college', ''),
    new.email
  );
  return new;
end;
$$ language plpgsql security definer;

-- 创建触发器：监听 auth.users 表的插入事件
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 方法 2：修改 RLS 策略允许插入（如果不想使用触发器）
-- 先删除旧策略
-- drop policy if exists "Users can insert own profile" on profiles;

-- 创建新策略：允许用户在注册时插入自己的资料
-- 这个策略更宽松，允许插入 id 匹配当前 auth.uid() 的记录
-- create policy "Users can insert own profile during registration" on profiles
--   for insert 
--   with check (
--     auth.uid() = id OR 
--     (auth.uid() IS NOT NULL AND id = auth.uid())
--   );

-- 方法 3：临时允许所有插入（仅用于测试，不推荐用于生产）
-- drop policy if exists "Users can insert own profile" on profiles;
-- create policy "Allow profile insertion" on profiles
--   for insert with check (true);
