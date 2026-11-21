// Ids for what the admin editor adds (a judge, a contestant, a criterion or sub-criterion, a
// presentation slot). The server keeps them and its id columns are VARCHAR(36), so each is a plain
// UUID (register B46: they were "<prefix>-<uuid>", 42-53 characters, and the save was refused).
// crypto.randomUUID exists only in a secure context (https, localhost); over plain HTTP on the LAN
// the UUID is built from crypto.getRandomValues, which is there, or from Math.random without it.
export type EditorIdSource = Partial<Pick<Crypto, 'randomUUID' | 'getRandomValues'>> | null

export function createEditorId(source: EditorIdSource = typeof crypto === 'undefined' ? null : crypto): string {
	if (typeof source?.randomUUID === 'function') {
		return source.randomUUID()
	}

	const bytes = new Uint8Array(16)
	if (typeof source?.getRandomValues === 'function') {
		source.getRandomValues(bytes)
	} else {
		for (let index = 0; index < bytes.length; index += 1) {
			bytes[index] = Math.floor(Math.random() * 256)
		}
	}

	// RFC 9562 version 4 and variant bits.
	bytes[6] = (bytes[6] & 0x0f) | 0x40
	bytes[8] = (bytes[8] & 0x3f) | 0x80
	const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
