import { h } from 'preact';
import { t } from '../../helpers';
import type { ProgressBarProps } from '../../types';

export function BrisaProgressBar({
  percent = 0,
  stage = '',
  label = '',
  indeterminate = false,
  cancellable = false,
  taskId,
  onCancel,
}: ProgressBarProps) {
  const stageKey = `stage.${stage}`;
  const stageLabel = t(stageKey) !== stageKey ? t(stageKey) : stage;

  return (
    <div class="progress-wrap">
      <div class="progress">
        <div
          class={`bar ${indeterminate ? 'indeterminate' : ''}`}
          style={!indeterminate ? `width: ${Math.min(100, Math.max(0, percent))}%` : ''}
        />
      </div>
      <div class="progress-info">
        <span class="stage">
          {label}
          {label && stageLabel ? ': ' : ''}
          {stageLabel}
        </span>
        {cancellable && taskId && (
          <button class="cancel-btn" onClick={() => onCancel?.(taskId)}>
            {t('task.cancel')}
          </button>
        )}
      </div>
    </div>
  );
}
