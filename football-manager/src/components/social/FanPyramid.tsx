import { SVGPiramide } from '../ui/SVGPiramide';

export interface PyramidLevel {
  label: string;
  value: number;
  color: string;
  detail?: string;
}

interface Props {
  levels: PyramidLevel[];
  total: number;
  onSelect?: (index: number) => void;
  selectedIndex?: number | null;
}

export function FanPyramid({ levels, total, onSelect, selectedIndex = null }: Props) {
  return (
    <SVGPiramide 
      levels={levels} 
      total={total} 
      onSliceClick={onSelect}
      selectedIndex={selectedIndex}
    />
  );
}
