-- 호스트에서 접속 시 인증 호환을 위해 root를 mysql_native_password로 설정
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'hrm_secret';
-- 다른 컨테이너(app)에서 mysql:3306으로 접속할 때 필요 (root@'%')
CREATE USER IF NOT EXISTS 'root'@'%' IDENTIFIED WITH mysql_native_password BY 'hrm_secret';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION;
FLUSH PRIVILEGES;
