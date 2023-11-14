// aws sigv4 requests using Crypto.Subtle

// Use STS creds from environment variables
function credentials() {
	const accessKeyId = process.env["AWS_ACCESS_KEY_ID"]
	const secretAccessKey = process.env["AWS_SECRET_ACCESS_KEY"]
	const sessionToken = process.env["AWS_SESSION_TOKEN"]
	return { accessKeyId, secretAccessKey, sessionToken }
}

// YYYYMMDDTHHMMSSZ
function amznDate(date) {
	return date.toISOString().slice(0, 19).replace(/[^\dT]/g, "") + 'Z' // YYYYMMDDTHHMMSSZ
}

// YYYMMMDD
function dateStamp(date) {
	return date.toISOString().replace(/[^\d]/g, "").slice(0,8)	// YYYYMMDD
}

// Turn a string/Uint8Array into a hex-encoded string
function hex(buffer) {
	const b = typeof(buffer) == 'string' ? str2chars(buffer) : buffer
	return [...b].map( (x) => x.toString(16).padStart(2,"0") ).join("")	// left zero pad digits less than 10 base 16
}

// Convert a string to a Uint8Array
function str2chars(s) {
	if (typeof(s) == 'Uint8Array') return s
	return (new TextEncoder()).encode(s)
}

// HMAC-SHA-256 hash of key,data
async function hmac256(key,data) {
	const kb = typeof(key) == 'string' ? str2chars(key) : key
	const db = typeof(data) == 'string' ? str2chars(data) : data
	const k = await crypto.subtle.importKey("raw",kb,{ name: "HMAC", hash: "SHA-256" },false,["sign"])
	const s = await crypto.subtle.sign({ name: "HMAC", hash: "SHA-256" },k,db)
	return new Uint8Array(s)
}

// SHA-256 digest of the given string 
async function digest(data) {
	const db = (typeof(data) == 'string') ? str2chars(data) : data
	const d = await crypto.subtle.digest("SHA-256",db)	
	return new Uint8Array(d)
}

// Generate the sigature of the AWS Sigv4 request
// https://docs.aws.amazon.com/general/latest/gr/create-signed-request.html#calculate-signature
async function signature(secret,date,region,service,sig) {
	const ds = dateStamp(date)
	const k = str2chars(secret)
	const prefix = new Uint8Array(4 + k.byteLength)
	prefix.set(str2chars("AWS4"),0)
	prefix.set(k,4)					// secret access key
	const s1 = await hmac256(prefix,ds)		// kDate
	const s2 = await hmac256(s1,region)		// kRegion
	const s3 = await hmac256(s2,service)		// kService
	const s4 = await hmac256(s3,"aws4_request")	// kSigning
	return hex(await hmac256(s4,sig))		// signature
}

// Get the host, path, and sorted query params
function parseUrl(url) {
	const { protocol, host, pathname, searchParams } = new URL(url)
	searchParams.sort()
	const params = searchParams
	return { protocol, host, pathname, params }
}

// unsignable headers
function signable(key) {
	return [ 'authorization', 'content-length', 'user-agent', 'expect', 'x-amzn-trace-id' ].indexOf(key.toLowerCase()) < 0
}

// Set the amz timestamp, sessiontoken, and host for the request
function createHeaders(headers,host,session,date) {
	const h = new Headers(headers)				// copy old
	h.set("x-amz-date", amznDate(date))			// set date
	if (session) h.set("x-amz-security-token",session)	// session token
	h.set("host",host)					// host
	return h
}

// Create headers for sigining presigned URLs
function presignHeaders(headers,host) {
	const h = new Headers(headers)
	h.set("host",host)
	return h
}

function presignQuery(params,service,region,access,session,date,expires,signedHeaders) {
	params.set("X-Amz-Date", amznDate(date))
	params.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256")
	params.set("X-Amz-Credential",access + "/" + scope(service,region,date))
	if (expires) params.set("X-Amz-Expires", expires)
	params.set("X-Amz-SignedHeaders",signedHeaders)
	params.sort()
	return params
}

// Generate a sorted eanonical header string, and list of signed headers
function canonicalize(headers) {
	const keys = [...headers.keys()].sort()
	var canonicalHeaders = "" // canonical headers
	const sa = []
	for (var k of keys) {
		canonicalHeaders += k.toLowerCase() + ":" + headers.get(k) + "\n"	
		if (signable(k)) sa.push(k.toLowerCase())
	}
	const signedHeaders = sa.join(";") // signed headers list
	return {canonicalHeaders, signedHeaders} 
}

// Generate the canonical request string
// https://docs.aws.amazon.com/general/latest/gr/create-signed-request.html#create-canonical-request
function canonicalRequest(method,path,query,headers,signed,bodysig) {
	return  method + "\n" +
		path + "\n" +
		query + "\n" +
		headers + "\n" +	// NB: each header ends in \n so \n gives us a blank line
		signed + "\n" + 
		bodysig
}

// Create the scope string
function scope(service,region,date) {
	return  dateStamp(date) + "/" + 
		region + "/" + 
		service + "/aws4_request"
}

// Generate the signing string, with the digest of the canonical request
// https://docs.aws.amazon.com/general/latest/gr/create-signed-request.html#create-string-to-sign
function stringToSign(service,region,date,canonicalsig) {
	return "AWS4-HMAC-SHA256\n" +					// algorithm
		amznDate(date) + "\n" +					// timestamp
		scope(service,region,date) + "\n" +			// scope
		canonicalsig						// canonical request digest
}
		    
// Generate the authorization header for the SigV4 request
function authToken(access,service,region,date,signedHeaders,sig) {
	return  "AWS4-HMAC-SHA256 " + 
		"Credential=" + access + "/" + scope(service,region,date) + ", " +
		"SignedHeaders=" + signedHeaders + ", " + 
		"Signature=" + sig
}

// Sign a request, returns the signed Request object
// https://docs.aws.amazon.com/general/latest/gr/create-signed-request.html#add-signature-to-request
// NB you need to pass the body of any POST/PUT etc. separate from the request object
// because in Firefox you can't inspect the body property of a Request object.
async function sign(service,region,creds,date,request,body) {
	const access = creds.accessKeyId
	const secret = creds.secretAccessKey
	const session = creds.sessionToken
	const method = request.method
	const url = request.url
	const { host, pathname, params } = parseUrl(url)
	const headers = createHeaders(request.headers,host,session,date)
	const { canonicalHeaders, signedHeaders } = canonicalize(headers)
	const bodysig = body ? hex(await digest(body )) : hex(await digest(""))
	const cr = canonicalRequest(method,pathname,params,canonicalHeaders,signedHeaders,bodysig)
	const crsig = hex(await digest(cr))
	const ss = stringToSign(service,region,date,crsig)
	const sig = await signature(secret,date,region,service,ss)
	const auth = authToken(access,service,region,date,signedHeaders,sig)
	headers.set("Authorization",auth)
	const redirect = request.redirect
	return body ? new Request(url,{ headers,method,body,redirect }) : new Request(url, { headers, method, redirect })
}

// Generate a presigned URL
// https://docs.aws.amazon.com/general/latest/gr/create-signed-request.html#add-signature-to-request
// https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
async function signUrl(service,region,creds,date,expires,payload,request) {
	const access = creds.accessKeyId
	const secret = creds.secretAccessKey
	const session = creds.sessionToken
	const method = request.method
	const url = request.url
	const { protocol, host, pathname, params } = parseUrl(url)
	const headers = presignHeaders(request.headers,host)
	const { canonicalHeaders, signedHeaders } = canonicalize(headers)
	const query = presignQuery(params,service,region,access,session,date,expires,signedHeaders)
	const cr = canonicalRequest(method,pathname,query,canonicalHeaders,signedHeaders,payload !== null ? hex(await digest(payload)) :"UNSIGNED-PAYLOAD")
	const crsig = hex(await digest(cr))
	const ss = stringToSign(service,region,date,crsig)
	const sig = await signature(secret,date,region,service,ss)
	return protocol + "//" + host + pathname + "?" + params + "&X-Amz-Signature=" + sig +
		(session ? "&X-Amz-Security-Token=" + encodeURIComponent(session) : "")
}

// module.exports = { sign, signUrl, credentials }
