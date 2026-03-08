-- 호스트에서 접속 시 인증 호환을 위해 root를 mysql_native_password로 설정
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'hrm_secret';
FLUSH PRIVILEGES;
