import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'ratingColor',
  standalone: true
})
export class RatingColorPipe implements PipeTransform {
  transform(rating: number | null | undefined): string {
    if (rating === null || rating === undefined) {
      return 'text-slate-500 bg-slate-800/60 border-slate-700/40';
    }
    if (rating >= 9.0) {
      return 'text-emerald-300 bg-emerald-500/20 border-emerald-500/30';
    }
    if (rating >= 7.5) {
      return 'text-violet-300 bg-violet-500/20 border-violet-500/30';
    }
    if (rating >= 6.5) {
      return 'text-amber-300 bg-amber-500/20 border-amber-500/30';
    }
    return 'text-rose-300 bg-rose-500/20 border-rose-500/30';
  }
}
