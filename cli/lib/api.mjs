/**
 * The website connector over HTTP. The command line is one more client of
 * the Tidysites connector (`<host>/mcp/tidysites`): every call is a tool
 * call with the credential as a bearer, so whatever the connector can do
 * for an assistant, the command line can do from a shell, and nothing is
 * opened for it that was not open already.
 */

export class ApiError extends Error {
	constructor(message, { status = null, details = null } = {}) {
		super(message);
		this.status = status;
		this.details = details;
	}
}

/**
 * Call one connector tool. Resolves to { text, json, images }: the text
 * content, the same parsed as JSON when it is JSON, and any images
 * (base64 with their media type).
 */
export async function callTool(cfg, name, args = {}, { fetchImpl = fetch } = {}) {
	const url = `${cfg.host.replace(/\/+$/, '')}/mcp/tidysites`;
	const res = await fetchImpl(url, {
		method: 'POST',
		headers: { authorization: `Bearer ${cfg.key}`, 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'tidysites-cli' },
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
	});
	const bodyText = await res.text();
	let rpc;
	try {
		rpc = JSON.parse(bodyText);
	} catch {
		throw new ApiError(`${url} answered ${res.status} with something that is not JSON: ${bodyText.slice(0, 200)}`, { status: res.status });
	}
	if (res.status === 401) throw new ApiError('The credential was refused. Run `tidysites init` again with a fresh command from the connector (connect_tidysites_cli).', { status: 401 });
	if (rpc.error) throw new ApiError(`${name}: ${rpc.error.message ?? JSON.stringify(rpc.error)}`, { status: res.status, details: rpc.error });
	const content = Array.isArray(rpc.result?.content) ? rpc.result.content : [];
	const text = content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
	const images = content.filter((c) => c.type === 'image').map((c) => ({ base64: c.data, mimeType: c.mimeType || 'image/png' }));
	if (rpc.result?.isError) {
		// "HTTP 422 — invalid_content: ... {details}" is how the connector words a refusal; keep the details readable.
		const m = text.match(/^HTTP (\d+) — ([a-z_]+): ([\s\S]*)$/);
		if (m) {
			const [, status, code, rest] = m;
			const brace = rest.indexOf(' {');
			let details = null;
			let message = rest;
			if (brace > 0) {
				try {
					details = JSON.parse(rest.slice(brace + 1));
					message = rest.slice(0, brace);
				} catch {
					/* leave the text whole */
				}
			}
			throw new ApiError(`${code}: ${message}`, { status: Number(status), details, code });
		}
		throw new ApiError(text || `${name} failed`, { status: res.status });
	}
	let json = null;
	try {
		json = JSON.parse(text);
	} catch {
		/* not JSON: fine, text stands */
	}
	return { text, json, images };
}
