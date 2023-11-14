
async function endpoint(api,stream,creds) {
	const d = new Date()
	const req = new Request( api + "/getDataEndpoint", {
		method: "POST",
		headers: {
			"Content-Type": "application/json"
		},
			})
	const body = JSON.stringify({
		"APIName": "GET_DASH_STREAMING_SESSION_URL",
		"StreamName": stream
	})
	const signedreq = await sign("kinesisvideo","eu-central-1",creds,d,req,body)
	const resp = await fetch(signedreq)
	const json = await resp.json()
	return json.DataEndpoint
}


async function session(api,stream,creds) {
	const d = new Date()
	const req = new Request(  api + "/getDASHStreamingSessionURL", {
		method: "POST",
		headers: { 
			"Content-Type": "application/json"
		},
	})
	const body = JSON.stringify({
		"Expires": 600,
		"StreamName": stream,
		"PlaybackMode":  "LIVE", 
	})
	const signedreq = await sign("kinesisvideo","eu-central-1",creds,d,req,body)
	const resp = await fetch(signedreq)
	const json = await resp.json()
	return json.DASHStreamingSessionURL
}

async function player() {
	let api = "https://kinesisvideo.eu-central-1.amazonaws.com"
	let stream = "test"  // change to your stream name
	let creds = tmpcreds
	let ep = await endpoint(api,stream,creds)
	console.log("endpoint",ep)
	let player = dashjs.MediaPlayer().create()
	let url = await session(ep,stream,creds)
	console.log("Session url", url)
	player.initialize(document.querySelector('#player'), url, true)
}
