'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import clsx from 'clsx';

/** A password field with a show/hide toggle (keyboard and screen-reader friendly). */
export default function PasswordInput({ className, ...props }: Omit<React.ComponentProps<'input'>, 'type'>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={show ? 'text' : 'password'} className={clsx('input pr-12', className)} />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
        disabled={props.disabled}
        className="btn btn-ghost btn-icon btn-sm absolute right-1 top-1/2 -translate-y-1/2"
      >
        {show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </div>
  );
}
