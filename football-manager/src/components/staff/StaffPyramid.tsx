import { useTranslation } from 'react-i18next';
import { SVGPiramide } from '../ui/SVGPiramide';

export interface PyramidLevel {
  id: string;
  label: string;
  count: number;
  max?: number;
  color: string;
}

interface Props {
  levels: PyramidLevel[];
  total: number;
}

export function StaffPyramid({ levels, total }: Props) {
  const { t } = useTranslation();
  
  // Transform levels for SVGPiramide
  const svgLevels = [...levels].reverse().map(l => ({
    label: l.label,
    value: l.count,
    color: l.color
  }));

  return (
    <SVGPiramide 
      levels={svgLevels} 
      total={total} 
      title={t('gameplay:staff.pyramid.total')} 
    />
  );
}
