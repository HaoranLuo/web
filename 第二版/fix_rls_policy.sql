-- 修复 RLS 策略问题
-- 在 Supabase SQL Editor 中执行此脚本

-- 先删除现有的 profiles 表的插入策略（如果存在）
drop policy if exists "Users can insert own profile" on profiles;

-- 重新创建插入策略，确保允许用户插入自己的资料
-- 注意：使用 with check 确保 id 字段等于 auth.uid()
create policy "Users can insert own profile" on profiles
  for insert 
  with check (auth.uid() = id);

-- 验证策略是否正确
-- 可以执行以下查询来检查策略：
-- select * from pg_policies where tablename = 'profiles';

-- 如果仍然有问题，可以临时允许所有用户插入（不推荐用于生产环境）
-- drop policy if exists "Allow all users to insert profile" on profiles;
-- create policy "Allow all users to insert profile" on profiles
--   for insert with check (true);
