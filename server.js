const express = require('express')
const app = express()
const port = 3000

app.get('/credentials.js', (req, res) => {
	const accessKeyId = process.env["AWS_ACCESS_KEY_ID"]
	const secretAccessKey = process.env["AWS_SECRET_ACCESS_KEY"]
	const sessionToken = process.env["AWS_SESSION_TOKEN"]
  res.send("window.tmpcreds = " + JSON.stringify({ accessKeyId, secretAccessKey, sessionToken }))
})

app.use(express.static('.'))

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
