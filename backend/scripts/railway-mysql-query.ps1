param(
  [Parameter(Mandatory = $true)]
  [string]$Sql
)

$escaped = $Sql.Replace('"', '\"')
$node = @"
const mysql=require('mysql2/promise');(async()=>{const c=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});const [rows]=await c.query(\"$escaped\");console.log(JSON.stringify(rows));await c.end();})().catch(e=>{console.error(e);process.exit(1);});
"@

Set-Location (Split-Path $PSScriptRoot -Parent)
npx --yes @railway/cli ssh --service phoenix-crm-backend -- "cd backend && node -e `"$node`""
