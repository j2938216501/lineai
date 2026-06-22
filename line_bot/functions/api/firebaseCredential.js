// firebaseCredential.js
import crypto from 'node:crypto';
import admin from 'firebase-admin';

export function credentialWithGlobalFetch(serviceAccount) {
    const credential = admin.credential.cert(serviceAccount);
    const { clientEmail, privateKey } = serviceAccount;
    const tokenUri = 'https://oauth2.googleapis.com/token';
    const b64 = (s) => Buffer.from(s).toString('base64url');

    credential.getAccessToken = async () => {
        const now = Math.floor(Date.now() / 1000);
        const scope = 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/devstorage.read_write';
        const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
        const body = b64(JSON.stringify({ iss: clientEmail, scope, aud: tokenUri, iat: now, exp: now + 3600 }));
        const sig = crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), privateKey).toString('base64url');

        const res = await fetch(tokenUri, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                assertion: `${head}.${body}.${sig}`,
            }),
        });
        if (!res.ok) throw new Error(`token mint failed: ${res.status} ${await res.text()}`);
        const j = await res.json();
        return { access_token: j.access_token, expires_in: j.expires_in };
    };
    return credential;
}