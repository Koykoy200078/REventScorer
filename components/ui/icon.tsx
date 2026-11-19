import { ICON_PATHS, type IconName } from './icon-data'

type IconProps = {
	name: IconName
	className?: string
	/** Read out by screen readers. Without it the icon is decorative and hidden from them. */
	label?: string
}

/**
 * A Material Symbols icon drawn from the vendored paths, so no icon font is fetched.
 * Like the mockups' `material-symbols-outlined` span it is 24px by default and follows a text-size
 * class (`text-[20px]`, `text-sm`), because the `es-icon` base class sizes it as 1em.
 */
export default function Icon({ name, className, label }: IconProps) {
	return (
		<svg
			viewBox='0 -960 960 960'
			fill='currentColor'
			className={className ? `es-icon ${className}` : 'es-icon'}
			focusable='false'
			{...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
		>
			<path d={ICON_PATHS[name]} />
		</svg>
	)
}
