import type { ReactNode, SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconUser(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx={12} cy={8} r={4} />
      <path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" />
    </Svg>
  );
}

export function IconStore(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 9 4.5 4h15L21 9" />
      <path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
      <path d="M5 11v9h14v-9" />
      <path d="M10 20v-5h4v5" />
    </Svg>
  );
}

export function IconPhone(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 3h3l2 5-2.5 1.5a11 11 0 0 0 7 7L16 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2Z" />
    </Svg>
  );
}

export function IconMapPin(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12Z" />
      <circle cx={12} cy={9} r={2.5} />
    </Svg>
  );
}

export function IconClock(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx={12} cy={12} r={9} />
      <path d="M12 7v5l3 2" />
    </Svg>
  );
}

export function IconGlobe(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx={12} cy={12} r={9} />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" />
    </Svg>
  );
}

export function IconCamera(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx={12} cy={13} r={3.5} />
    </Svg>
  );
}

export function IconImage(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x={3} y={4} width={18} height={16} rx={2} />
      <circle cx={9} cy={10} r={1.5} />
      <path d="m21 16-5-5-9 9" />
    </Svg>
  );
}

export function IconHex(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 2.5 20.5 7.25v9.5L12 21.5l-8.5-4.75v-9.5Z" />
      <path d="M12 8v8M9 10.5h4.5a1.5 1.5 0 0 1 0 3H10.5a1.5 1.5 0 0 0 0 3H15" />
    </Svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function IconCopy(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x={9} y={9} width={11} height={11} rx={2} />
      <path d="M5 15V5a1 1 0 0 1 1-1h10" />
    </Svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Svg>
  );
}

export function IconLogout(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 8l-4 4 4 4M6 12h10" />
    </Svg>
  );
}

export function IconChevronRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m9 6 6 6-6 6" />
    </Svg>
  );
}

export function IconQr(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x={3} y={3} width={7} height={7} rx={1} />
      <rect x={14} y={3} width={7} height={7} rx={1} />
      <rect x={3} y={14} width={7} height={7} rx={1} />
      <path d="M14 14h3v3M21 14v.01M14 21h3M21 18v3h-3" />
    </Svg>
  );
}

export function IconChart(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20V4M4 20h16" />
      <path d="M8 16v-4M12 16V8M16 16v-6" />
    </Svg>
  );
}

export function IconLayout(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x={3} y={4} width={18} height={16} rx={2} />
      <path d="M3 9h18M9 9v11" />
    </Svg>
  );
}

export function IconHome(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1Z" />
    </Svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function IconExternal(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </Svg>
  );
}

export function IconNavigation(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 11 21 3l-8 18-2-8Z" />
    </Svg>
  );
}

export function IconWallet(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M19 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V6" />
      <path d="M17 14h.01" />
    </Svg>
  );
}

export function IconCalendar(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x={3} y={5} width={18} height={16} rx={2} />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </Svg>
  );
}
