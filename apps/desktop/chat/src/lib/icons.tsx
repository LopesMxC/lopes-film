/**
 * Lopes.Film's own icons. A set of its own drawing: a 24 px grid, a 1.75 stroke, square ends and mitered corners, with the
 * round things (a magnifier, a ban sign, a scissors' rings) cut as octagons and squares, so the set reads as Lopes.Film's
 * and not as a generic library's. Each takes the props lucide's icons did (`size`, `strokeWidth`, `className`, `style`…),
 * so one stands in for another by name; those not drawn here are lucide's, passed on by name.
 */
import * as React from 'react';

export {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  BellRing,
  Blocks,
  Brackets,
  Circle,
  CircleAlert,
  CircleCheck,
  CircleDot,
  ClipboardCopy,
  Coins,
  CornerDownLeft,
  CornerDownRight,
  Crop,
  Ear,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileJson,
  FilePen,
  FileSearch,
  FileSpreadsheet,
  FileText,
  FileVideo,
  FolderPlus,
  Globe,
  ImagePlus,
  Info,
  KeyRound,
  Languages,
  LibraryBig,
  MessageCircle,
  MessageCircleQuestion,
  MousePointer2,
  Paperclip,
  PenLine,
  Pin,
  PinOff,
  Quote,
  RefreshCw,
  Rows3,
  ScrollText,
  Settings,
  Shapes,
  ShieldQuestion,
  SquareDashed,
  SquareTerminal,
  Subtitles,
  TriangleAlert,
  UserRound,
  Video,
  Waves,
} from 'lucide-react';
export type { LucideIcon } from 'lucide-react';

type IconProps = Omit<React.SVGProps<SVGSVGElement>, 'ref'> & { size?: number | string; strokeWidth?: number | string; absoluteStrokeWidth?: boolean };

function icon(name: string, body: React.ReactNode) {
  const Icon = React.forwardRef<SVGSVGElement, IconProps>(({ size = 24, strokeWidth = 1.75, absoluteStrokeWidth: _a, ...rest }, ref) => (
    <svg
      ref={ref} xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="square" strokeLinejoin="miter" strokeMiterlimit={10} data-lopesfilm-icon={name} {...rest}
    >
      {body}
    </svg>
  ));
  Icon.displayName = name;
  return Icon;
}
const p = (d: string) => <path d={d} />;

export const X = icon('X', p('M5 5l14 14M19 5L5 19'));
export const Plus = icon('Plus', p('M12 4v16M4 12h16'));
export const Check = icon('Check', p('M4 12.5l5 5L20 6.5'));
export const Loader2 = icon('Loader2', p('M21 12a9 9 0 1 1-9-9'));
export const ChevronDown = icon('ChevronDown', p('M5 9l7 7 7-7'));
export const ChevronUp = icon('ChevronUp', p('M5 15l7-7 7 7'));
export const ChevronRight = icon('ChevronRight', p('M9 5l7 7-7 7'));
export const ChevronLeft = icon('ChevronLeft', p('M15 5l-7 7 7 7'));
export const ChevronsLeft = icon('ChevronsLeft', p('M11 6l-6 6 6 6M19 6l-6 6 6 6'));
export const ChevronsRight = icon('ChevronsRight', p('M13 6l6 6-6 6M5 6l6 6-6 6'));
export const Trash2 = icon('Trash2', p('M4 6h16M9 6V3.5h6V6M6 6l1 14.5h10L18 6M10 10v7M14 10v7'));
export const Play = icon('Play', p('M7 4.5v15l12-7.5z'));
export const Pause = icon('Pause', p('M7 5h3.5v14H7zM13.5 5H17v14h-3.5z'));
export const Square = icon('Square', p('M5 5h14v14H5z'));
export const Scissors = icon('Scissors', p('M6.5 3.5l11 12M17.5 3.5l-11 12M3.5 15.5h5v5h-5zM15.5 15.5h5v5h-5z'));
export const Clapperboard = icon('Clapperboard', p('M3 10.5h18V20H3zM3.4 6.3L20 3.3l.8 4.3L4.2 10.5zM8 4.4l2 3.9M13 3.5l2 3.9'));
export const Search = icon('Search', p('M8 4h5l3.5 3.5v5L13 16H8l-3.5-3.5v-5zM15 14.5l5 5'));
export const Download = icon('Download', p('M12 4v11M7 11l5 5 5-5M4 20h16'));
export const Upload = icon('Upload', p('M12 16V5M7 9l5-5 5 5M4 20h16'));
export const Film = icon('Film', p('M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4'));
export const Image = icon('Image', p('M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M14.5 8.5H16V10h-1.5z'));
export const Folder = icon('Folder', p('M3 19V5.5h6.5L12 8h9V19z'));
export const FolderOpen = icon('FolderOpen', p('M3 19V5.5h6.5L12 8h8v3M3 19l2.5-8H22l-2.5 8z'));
export const AudioLines = icon('AudioLines', p('M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4'));
export const RotateCcw = icon('RotateCcw', p('M4 5v5h5M4.6 10A8 8 0 1 1 6 16.5'));
export const Sparkles = icon('Sparkles', p('M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z'));
export const Copy = icon('Copy', p('M9 9h11v11H9zM5 15V4h11'));
export const Layers = icon('Layers', p('M12 3l9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5'));
export const Pencil = icon('Pencil', p('M4 20l1-5L16 4l4 4L9 19zM13.5 6.5l4 4'));
export const Type = icon('Type', p('M5 6.5V4h14v2.5M12 4v16M9 20h6'));
export const ExternalLink = icon('ExternalLink', p('M14 4h6v6M20 4l-9 9M18 14v6H4V6h6'));
export const Ban = icon('Ban', p('M8 3.5h8L20.5 8v8L16 20.5H8L3.5 16V8zM6 18L18 6'));
export const ArrowLeft = icon('ArrowLeft', p('M20 12H4M10 6l-6 6 6 6'));
export const ArrowRight = icon('ArrowRight', p('M4 12h16M14 6l6 6-6 6'));
export const ArrowDownToLine = icon('ArrowDownToLine', p('M12 4v12M7 11l5 5 5-5M5 20h14'));
export const Music = icon('Music', p('M9 18V5l11-2v13M4.5 15h4.5v4.5H4.5zM15.5 13H20v4.5h-4.5z'));
export const Maximize2 = icon('Maximize2', p('M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7'));
export const Minimize2 = icon('Minimize2', p('M20 10h-6V4M4 14h6v6M14 10l7-7M3 21l7-7'));
export const LayoutGrid = icon('LayoutGrid', p('M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'));
export const Star = icon('Star', p('M12 3l2.7 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17.2l-5.6 3.1 1.2-6.3L3 9.6l6.3-.8z'));
export const MoreHorizontal = icon('MoreHorizontal', p('M5 11h2v2H5zM11 11h2v2h-2zM17 11h2v2h-2z'));
export const Mic = icon('Mic', p('M9 3.5h6v10H9zM5 11v1a7 7 0 0 0 14 0v-1M12 19v2.5'));
export const Lock = icon('Lock', p('M5 10.5h14V20H5zM8 10.5V7a4 4 0 0 1 8 0v3.5'));
export const Eye = icon('Eye', p('M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM10 10h4v4h-4z'));
export const EyeOff = icon('EyeOff', p('M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM4 4l16 16'));
export const Undo2 = icon('Undo2', p('M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3'));
export const Redo2 = icon('Redo2', p('M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3'));
export const Volume2 = icon('Volume2', p('M4 9.5h4L13 5v14l-5-4.5H4zM16.5 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11'));
export const VolumeX = icon('VolumeX', p('M4 9.5h4L13 5v14l-5-4.5H4zM16 9.5l5 5M21 9.5l-5 5'));
export const Link2 = icon('Link2', p('M10 8H7a4 4 0 0 0 0 8h3M14 8h3a4 4 0 0 1 0 8h-3M8.5 12h7'));
export const Link2Off = icon('Link2Off', p('M10 8H7a4 4 0 0 0 0 8h3M14 8h3a4 4 0 0 1 0 8h-3M4 4l16 16'));
const sliders = p('M4 7h9M17 7h3M4 17h3M11 17h9M13 4.5v5h4v-5zM7 14.5v5h4v-5z');
export const Settings2 = icon('Settings2', sliders);
export const SlidersHorizontal = icon('SlidersHorizontal', sliders);
export const Wrench = icon('Wrench', p('M15 4a5 5 0 0 0-4.6 6.9L3.5 17.8l2.7 2.7 6.9-6.9A5 5 0 0 0 20 9l-3 3-3-1-1-3z'));
export const Magnet = icon('Magnet', p('M5 3.5h4.5V13a2.5 2.5 0 0 0 5 0V3.5H19V13a7 7 0 0 1-14 0zM5 8h4.5M14.5 8H19'));
export const SplitSquareHorizontal = icon('SplitSquareHorizontal', p('M4 5h16v14H4zM12 5v14M8 10l-2 2 2 2M16 10l2 2-2 2'));
export const ClipboardX = icon('ClipboardX', p('M8 4h8v3H8zM6 5.5H4.5V21h15V5.5H18M9.5 11l5 5M14.5 11l-5 5'));
export const Bot = icon('Bot', p('M5 8h14v11H5zM12 8V4M9 13v2M15 13v2M3 12v3M21 12v3'));
export const Captions = icon('Captions', p('M3 5h18v14H3zM7 11h3M7 15h5M14 11h3M15 15h2'));
export const Clock3 = icon('Clock3', p('M8 3.5h8L20.5 8v8L16 20.5H8L3.5 16V8zM12 7.5V12l3 2'));
