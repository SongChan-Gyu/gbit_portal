-- 호스트에서 접속 시 인증 호환
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'hrm_secret';
-- 앱 컨테이너가 mysql:3306 으로 접속할 때 필요
CREATE USER IF NOT EXISTS 'root'@'%' IDENTIFIED WITH mysql_native_password BY 'hrm_secret';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION;
FLUSH PRIVILEGES;
