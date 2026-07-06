import {
  Coffee,
  Dice5,
  Dumbbell,
  Film,
  Gamepad2,
  MoreHorizontal,
  MountainSnow,
  Music,
  Plane,
} from 'lucide-react-native';
import { ActivityCategory } from '@/src/types';

const ICON_MAP: Record<ActivityCategory, React.ComponentType<{ size: number; color: string; strokeWidth?: number }>> = {
  sports:       Dumbbell,
  board_games:  Dice5,
  video_games:  Gamepad2,
  movies:       Film,
  music:        Music,
  food_drinks:  Coffee,
  outdoors:     MountainSnow,
  travel:       Plane,
  other:        MoreHorizontal,
};

export const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  sports:       'Sports',
  board_games:  'Board Games',
  video_games:  'Video Games',
  movies:       'Movies',
  music:        'Music',
  food_drinks:  'Food & Drinks',
  outdoors:     'Outdoors',
  travel:       'Travel',
  other:        'Other',
};

interface CategoryIconProps {
  category: ActivityCategory;
  size?: number;
  color: string;
}

export function CategoryIcon({ category, size = 20, color }: CategoryIconProps) {
  const Icon = ICON_MAP[category] ?? MoreHorizontal;
  return <Icon size={size} color={color} strokeWidth={1.75} />;
}
