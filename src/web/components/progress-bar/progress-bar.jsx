/** @jsx h */
import { h } from 'preact';
import { t } from '../../helpers.js';

/**
 * Progress bar with stage label and optional cancel button.
 * @param {{ percent: number, stage: string, label: string, indeterminate?: boolean, cancellable?: boolean, taskId?: string, onCancel?: Function }} props
 */
export function BrisaProgressBar({ percent = 0, stage = '', label = '', indeterminate = false, cancellable = false, taskId, onCancel }) {
  const stageLabel = t(`stage.${stage}`) !== `stage.${stage}` ? t(`stage.${stage}`) : stage;

  return (
    <div class="progress-wrap">
      <div class="progress">
        <div
          class={`bar ${indeterminate ? 'indeterminate' : ''}`}
          style={!indeterminate ? `width: ${Math.min(100, Math.max(0, percent))}%` : ''}
        />
      </div>
      <div class="progress-info">
        <span class="stage">{label}{label && stageLabel ? ': ' : ''}{stageLabel}</span>
        {cancellable && (
          <button class="cancel-btn" onClick={() => onCancel?.(taskId)}>
            {t('task.cancel')}
          </button>
        )}
      </div>
    </div>
  );
}
