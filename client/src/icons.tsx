import type { ReactNode, SVGProps } from "react"

// A small inline icon set for the admin screens, drawn after Lucide
// (https://lucide.dev, ISC licence) -- the set the design prototype uses --
// so the app needs no icon dependency. 24×24, stroked in currentColor;
// size them with CSS.
type IconProps = SVGProps<SVGSVGElement>

function icon(paths: ReactNode) {
  return function Icon(props: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...props}
      >
        {paths}
      </svg>
    )
  }
}

export const HomeIcon = icon(
  <>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
    <path d="M10 21v-6h4v6" />
  </>,
)
export const LayersIcon = icon(
  <>
    <path d="m12 2 10 5-10 5L2 7l10-5Z" />
    <path d="m2 12 10 5 10-5" />
    <path d="m2 17 10 5 10-5" />
  </>,
)
export const ClipboardIcon = icon(
  <>
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <path d="M12 11h4" />
    <path d="M12 16h4" />
    <path d="M8 11h.01" />
    <path d="M8 16h.01" />
  </>,
)
export const FileTextIcon = icon(
  <>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6" />
    <path d="M16 13H8" />
    <path d="M16 17H8" />
  </>,
)
export const DatabaseIcon = icon(
  <>
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5v14a9 3 0 0 0 18 0V5" />
    <path d="M3 12a9 3 0 0 0 18 0" />
  </>,
)
export const LinkIcon = icon(
  <>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </>,
)
export const MenuIcon = icon(
  <>
    <path d="M4 6h16" />
    <path d="M4 12h16" />
    <path d="M4 18h16" />
  </>,
)
export const CloseIcon = icon(
  <>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </>,
)
export const PlusIcon = icon(
  <>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </>,
)
export const SearchIcon = icon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>,
)
export const FilterIcon = icon(<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3Z" />)
export const CheckIcon = icon(<path d="M20 6 9 17l-5-5" />)
export const ChevronRightIcon = icon(<path d="m9 18 6-6-6-6" />)
export const ArrowLeftIcon = icon(
  <>
    <path d="M19 12H5" />
    <path d="m12 19-7-7 7-7" />
  </>,
)
export const ArrowRightIcon = icon(
  <>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </>,
)
export const ArrowUpIcon = icon(
  <>
    <path d="m5 12 7-7 7 7" />
    <path d="M12 19V5" />
  </>,
)
export const ArrowDownIcon = icon(
  <>
    <path d="M12 5v14" />
    <path d="m19 12-7 7-7-7" />
  </>,
)
export const TrashIcon = icon(
  <>
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </>,
)
export const CopyIcon = icon(
  <>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </>,
)
export const ArchiveIcon = icon(
  <>
    <rect x="2" y="3" width="20" height="5" rx="1" />
    <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
    <path d="M10 12h4" />
  </>,
)
export const EyeIcon = icon(
  <>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </>,
)
export const LockIcon = icon(
  <>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </>,
)
export const ShieldCheckIcon = icon(
  <>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    <path d="m9 12 2 2 4-4" />
  </>,
)
export const SettingsIcon = icon(
  <>
    <path d="M20 7h-9" />
    <path d="M14 17H5" />
    <circle cx="17" cy="17" r="3" />
    <circle cx="7" cy="7" r="3" />
  </>,
)
export const HistoryIcon = icon(
  <>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l4 2" />
  </>,
)
export const SendIcon = icon(
  <>
    <path d="m22 2-7 20-4-9-9-4Z" />
    <path d="M22 2 11 13" />
  </>,
)
export const AlertIcon = icon(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4" />
    <path d="M12 16h.01" />
  </>,
)
export const TypeIcon = icon(
  <>
    <path d="M4 7V4h16v3" />
    <path d="M9 20h6" />
    <path d="M12 4v16" />
  </>,
)
export const AlignLeftIcon = icon(
  <>
    <path d="M21 6H3" />
    <path d="M15 12H3" />
    <path d="M17 18H3" />
  </>,
)
export const ListIcon = icon(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="m9 10 3 3 3-3" />
  </>,
)
export const CheckSquareIcon = icon(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="m9 12 2 2 4-4" />
  </>,
)
export const CircleDotIcon = icon(
  <>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="3" />
  </>,
)
export const CalendarIcon = icon(
  <>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4" />
    <path d="M8 2v4" />
    <path d="M3 10h18" />
  </>,
)
export const HashIcon = icon(
  <>
    <path d="M4 9h16" />
    <path d="M4 15h16" />
    <path d="M10 3 8 21" />
    <path d="M16 3l-2 18" />
  </>,
)
export const UsersIcon = icon(
  <>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </>,
)
