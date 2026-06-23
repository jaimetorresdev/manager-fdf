import type { ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children: ReactNode;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  isSubmitting?: boolean;
}

export function ConfirmModal({ 
  open, 
  onClose, 
  onConfirm, 
  title, 
  children, 
  confirmText = 'Confirmar', 
  cancelText = 'Cancelar',
  isDestructive = false,
  isSubmitting = false
}: Props) {
  return (
    <Modal open={open} onClose={onClose} title={title} width={400}>
      <div className="space-y-6">
        <div className="text-sm text-[var(--text-primary)]">
          {children}
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {cancelText}
          </Button>
          <Button 
            variant={isDestructive ? 'danger' : 'primary'} 
            onClick={onConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? '...' : confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
