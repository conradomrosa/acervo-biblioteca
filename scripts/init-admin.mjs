import { randomBytes, pbkdf2Sync } from 'node:crypto';
const username=process.env.ADMIN_USERNAME, password=process.env.ADMIN_PASSWORD, name=process.env.ADMIN_NAME||'Bibliotecário';
if(!username||!password){console.error('Defina ADMIN_USERNAME e ADMIN_PASSWORD.');process.exit(1)}
if(password.length<12){console.error('A senha deve possuir pelo menos 12 caracteres.');process.exit(1)}
const salt=randomBytes(16), hash=pbkdf2Sync(password,salt,150000,32,'sha256');
const quote=v=>`'${String(v).replaceAll("'","''")}'`;
console.log(`INSERT INTO librarians(name,username,password_hash) VALUES(${quote(name)},${quote(username)},${quote(`pbkdf2$150000$${salt.toString('base64url')}$${hash.toString('base64url')}`)}) ON CONFLICT(username) DO UPDATE SET name=excluded.name,password_hash=excluded.password_hash,active=1;`);
