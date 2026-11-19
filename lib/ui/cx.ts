/** Joins class names, skipping empty and falsy parts: cx('a', isOn && 'b', className). */
export function cx(...parts: Array<string | false | null | undefined>): string {
	return parts
		.map((part) => (part ? part.trim() : ''))
		.filter(Boolean)
		.join(' ')
}
