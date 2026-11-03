'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface CampaignOption {
  id: string;
  name: string;
}

interface CampaignDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: CampaignOption[];
  onDelete?: (campaignId: string, campaignName: string) => void;
}

export default function CampaignDropdown({
  value,
  onChange,
  options,
  onDelete,
}: CampaignDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (option: CampaignOption) => {
    onChange(option.name);
    setIsOpen(false);
  };

  const selectedOption = options.find(opt => opt.name === value);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="font-sans flex h-10 items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 text-sm font-medium text-on-surface transition-all hover:bg-surface-container active:bg-surface-container-high w-full justify-between"
      >
        <span>{value}</span>
        <ChevronDown
          size={18}
          className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="dropdown-panel absolute top-full left-0 mt-2 z-50 rounded-lg border border-outline-variant bg-surface-container-lowest shadow-modal w-80">
          {options.map((option) => (
            <div
              key={option.id}
              className={`font-sans px-4 py-3 text-sm font-medium transition-all first:rounded-t-lg last:rounded-b-lg flex items-center justify-between group hover:bg-surface-container ${
                value === option.name
                  ? 'bg-primary-fixed text-on-primary-fixed'
                  : 'text-on-surface'
              }`}
            >
              <button
                onClick={() => handleSelect(option)}
                className="flex-1 text-left truncate"
              >
                {option.name}
              </button>
              {option.name !== 'All' && (
                <div className="flex gap-3 ml-4 flex-shrink-0 text-sm font-medium">
                  {onDelete && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(option.id, option.name);
                          setIsOpen(false);
                        }}
                        className={`transition-colors hover:underline ${
                          value === option.name ? 'text-on-primary-fixed' : 'text-error'
                        }`}
                        title="Remove campaign from this client"
                      >
                        Remove
                      </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
