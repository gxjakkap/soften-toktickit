import 'dotenv/config'
import { app } from './app.js'

const port = process.env.PORT ?? 3001

app.listen(Number(port), '0.0.0.0', () => {
  console.log(`Server listening on port ${port}`)
})
