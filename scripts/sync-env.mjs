import { copyFileSync, existsSync } from 'node:fs'

if (!existsSync('.env') && existsSync('.env.example')) {
  copyFileSync('.env.example', '.env')
}
