# Backup do banco — Condor Validade

Backup diário às **23:59 (Brasília)** do banco inteiro do Supabase (estrutura, dados e usuários do login), em `backups/AAAA-MM-DD.sql.gz.gpg`.
Os arquivos são **criptografados** (AES-256). Sem a senha (`BACKUP_PASSPHRASE`) não abrem — **guarde essa senha fora do GitHub** (gerenciador de senhas). Se perdê-la, os backups ficam inúteis.

## Restaurar
```bash
gpg -d backups/2026-11-01.sql.gz.gpg | gunzip > restaurar.sql      # pede a senha
psql "URL_DO_BANCO_DE_DESTINO" -f restaurar.sql                      # de preferência num projeto Supabase novo/vazio
```

## Testar agora
Aba **Actions → Backup diário do banco → Run workflow**. Deve ficar verde e aparecer um commit com o arquivo em `backups/`.
Se falhar, o GitHub manda e-mail e o log mostra o motivo.
