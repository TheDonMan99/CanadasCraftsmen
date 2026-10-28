// Shared types for the cut-file engine. All lengths are inches, y grows downward
// (SVG convention), and the origin is the top-left corner of the sign.

export type Pt = { x: number; y: number };
/** A set of closed polygons in inches: outer contours and holes, non-zero fill. */
export type Shape = Pt[][];

export type LineRole = 'top' | 'main' | 'small';
export type Layout = 'horizontal' | 'vertical';
export type StyleKey = 'one_piece' | 'layered' | 'letters_on_backer' | 'stencil';
export type BackerShapeKey = 'rectangle' | 'rounded_rectangle' | 'plank' | 'arch_top' | 'oval' | 'circle';
export type FloatingBits = 'bridge' | 'merge' | 'remove';
export type WeldMode = 'script' | 'block';

export interface DesignLine {
  role: LineRole;
  text: string;
  fontId: string;
  /** Engrave this line on the backer instead of cutting it (small lines only). */
  engraved?: boolean;
  /** Letter height relative to the main line; defaults come from engine settings. */
  sizeRatio?: number;
}

export interface BackerSpec {
  shape: BackerShapeKey;
  cornerRadiusIn?: number;
  paddingIn?: number;
  plankWidthIn?: number;
}

export interface Design {
  layout: Layout;
  style: StyleKey;
  /** Ordered width for horizontal signs. */
  widthIn?: number;
  /** Ordered height for vertical porch leaners. */
  heightIn?: number;
  lines: DesignLine[];
  backer?: BackerSpec;
  floatingBits?: FloatingBits;
  keyholes?: boolean;
  /** Vertical leaners: flat base foot (default from settings). */
  leanerFoot?: boolean;
}

export interface FontSpec {
  id: string;
  label: string;
  allowedLines: LineRole[];
  autoThickenIn: number;
  weldMode: WeldMode;
}

export interface MaterialSpec {
  id: string;
  label: string;
  thicknessIn: number;
  kerfIn: number;
  minFeatureIn: number;
  passes: number;
  cutSpeedInMin: number | null;
  lightburnName: string;
  fileTag: string;
}

export interface EngineSettings {
  weld_overlap_in: number;
  max_tighten_pct: number;
  tighten_step_pct: number;
  baseline_bar_in: number;
  bridge_width_in: number;
  dot_bridge_width_in: number;
  stencil_bridge_width_in: number;
  stencil_bridges_per_hole: number;
  layered_outline_offset_in: number;
  line_spacing_ratio: number;
  keyhole_head_dia_in: number;
  keyhole_slot_width_in: number;
  keyhole_slot_length_in: number;
  keyhole_positions: number[];
  curve_tolerance_in: number;
  backer_padding_in: number;
  floating_bits: FloatingBits;
  leaner_spine_width_in: number;
  leaner_letter_gap_in: number;
  leaner_foot_height_in: number;
  leaner_foot: boolean;
  leaner_keyhole: boolean;
  small_line_ratio: number;
  top_line_ratio: number;
  max_bridge_length_in: number;
  thin_tail_ignore_len_in: number;
  default_cut_speed_in_min: number;
  score_speed_in_min: number;
  engrave_speed_in_min: number;
  engrave_line_interval_in: number;
  travel_overhead_pct: number;
}

export interface SizeRules {
  min_letter_height_in: { main: number; top: number; small_cut: number; small_engraved: number };
  max_chars: { top: number; main: number; small: number };
}

export interface EngineContext {
  fonts: Record<string, { spec: FontSpec; font: import('./font').LoadedFont }>;
  material: MaterialSpec;
  settings: EngineSettings;
  sizes: SizeRules;
  largestSignIn: number;
}

export type PartRole = 'word' | 'outline' | 'backer' | 'letters' | 'panel' | 'bit';
export type ColourPiece = 'word' | 'top' | 'outline' | 'letters' | 'backer' | 'panel';

export interface Part {
  id: string;
  name: string;
  role: PartRole;
  colourPiece: ColourPiece;
  /** Design geometry at true size, assembled position, before kerf. */
  shape: Shape;
  /** Cut toolpaths: the shape offset by half the kerf. */
  cut: Shape;
  /** Letters this part carries, for listing. */
  chars: string;
  areaIn2: number;
  bounds: Bounds;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type FailureCode =
  | 'empty_text'
  | 'missing_glyphs'
  | 'font_not_allowed_for_line'
  | 'too_many_chars'
  | 'letters_too_small'
  | 'too_wide'
  | 'too_tall'
  | 'not_one_piece'
  | 'loose_centres'
  | 'thin_section'
  | 'engraved_needs_backer'
  | 'invalid_design';

export interface Issue {
  code: FailureCode | string;
  message: string;
  detail?: Record<string, unknown>;
}

export interface ThinSpot {
  partId: string;
  x: number;
  y: number;
  widthIn: number;
}

export type ConnectMethod = 'weld' | 'tighten' | 'baseline_bar' | 'bridges' | 'failed' | 'separate' | 'spine' | 'stack_overlap';

export interface LineReport {
  role: LineRole;
  text: string;
  fontId: string;
  letterHeightIn: number;
  method: ConnectMethod;
  tightenPct: number;
  engraved: boolean;
}

export interface EngineReport {
  pieceCount: number;
  expectedPieces: string;
  widthIn: number;
  heightIn: number;
  thinnest: ThinSpot | null;
  cutLengthIn: number;
  scoreLengthIn: number;
  engraveAreaIn2: number;
  partAreaIn2: number;
  laserMinutes: number;
  lines: LineReport[];
  pieces: { id: string; name: string; chars: string; widthIn: number; heightIn: number }[];
  keyholes: Pt[];
  bridges: number;
}

export interface EngineResult {
  ok: boolean;
  failures: Issue[];
  warnings: Issue[];
  parts: Part[];
  /** Score lines (placement guide, plank lines), assembled position. */
  score: Shape;
  /** Open score lines (plank board lines), assembled position. */
  scoreLines: Pt[][];
  /** Filled engrave areas, assembled position. */
  engrave: Shape;
  /** Regions thinner than the minimum feature width, for red highlighting. */
  thinRegions: Shape;
  report: EngineReport;
  /** Total sign outline size (design size, no kerf). */
  widthIn: number;
  heightIn: number;
}
