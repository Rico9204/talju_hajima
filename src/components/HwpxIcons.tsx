import React from "react";

// 한컴오피스 / 한컴독스 표준 24x24 리본 벡터 아이콘 모음

export function SaveIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M19 21H5C3.89543 21 3 20.1046 3 19V5C3 3.89543 3.89543 3 5 3H16L21 8V19C21 20.1046 20.1046 21 19 21Z" fill="#3B82F6" stroke="#2563EB" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M7 3V8H15V3H7Z" fill="#E2E8F0"/>
      <path d="M12 5H14V6H12V5Z" fill="#3B82F6"/>
      <path d="M6 13H18V21H6V13Z" fill="#FFFFFF"/>
      <rect x="8" y="15" width="8" height="1.5" rx="0.75" fill="#94A3B8"/>
      <rect x="8" y="18" width="5" height="1.5" rx="0.75" fill="#94A3B8"/>
    </svg>
  );
}

export function CutIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="6" cy="6" r="3" stroke="#EF4444" strokeWidth="1.5"/>
      <circle cx="6" cy="18" r="3" stroke="#EF4444" strokeWidth="1.5"/>
      <path d="M8.5 7.5L19 18M8.5 16.5L19 6" stroke="#64748B" strokeWidth="1.75" strokeLinecap="round"/>
      <circle cx="12" cy="12" r="1.5" fill="#EF4444"/>
    </svg>
  );
}

export function CopyIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="4" width="12" height="15" rx="1.5" fill="#BFDBFE" stroke="#3B82F6" strokeWidth="1.5"/>
      <rect x="4" y="8" width="12" height="14" rx="1.5" fill="#FFFFFF" stroke="#2563EB" strokeWidth="1.5"/>
      <line x1="7" y1="12" x2="13" y2="12" stroke="#93C5FD" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="7" y1="15" x2="13" y2="15" stroke="#93C5FD" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="7" y1="18" x2="11" y2="18" stroke="#93C5FD" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

export function PasteIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="5" width="16" height="17" rx="2" fill="#FEF3C7" stroke="#D97706" strokeWidth="1.5"/>
      <path d="M8 5V3C8 2.44772 8.44772 2 9 2H15C15.5523 2 16 2.44772 16 3V5" fill="#CBD5E1" stroke="#64748B" strokeWidth="1.5"/>
      <rect x="7" y="9" width="10" height="10" rx="1" fill="#FFFFFF" stroke="#3B82F6" strokeWidth="1.25"/>
      <line x1="9" y1="12" x2="15" y2="12" stroke="#60A5FA" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="9" y1="15" x2="13" y2="15" stroke="#60A5FA" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

export function FormatPainterIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="3" width="13" height="6" rx="2" fill="#3B82F6" stroke="#1D4ED8" strokeWidth="1.5"/>
      <path d="M17 6H19C19.5523 6 20 6.44772 20 7V12C20 12.5523 19.5523 13 19 13H13V15" stroke="#64748B" strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="11" y="15" width="4" height="7" rx="1" fill="#F59E0B" stroke="#D97706" strokeWidth="1.2"/>
      <line x1="7" y1="5" x2="7" y2="7" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="10" y1="5" x2="10" y2="7" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="13" y1="5" x2="13" y2="7" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

export function SearchIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="11" r="5" fill="#E0F2FE" stroke="#0284C7" strokeWidth="1.5"/>
      <circle cx="16" cy="11" r="5" fill="#E0F2FE" stroke="#0284C7" strokeWidth="1.5"/>
      <path d="M11 11H13" stroke="#0284C7" strokeWidth="1.5"/>
      <path d="M5 16L3 20M19 16L21 20" stroke="#64748B" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

export function ShapesIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="10" width="9" height="9" rx="1.5" fill="#C084FC" stroke="#9333EA" strokeWidth="1.5"/>
      <circle cx="16.5" cy="8.5" r="4.5" fill="#93C5FD" stroke="#2563EB" strokeWidth="1.5"/>
      <polygon points="17,14 21,21 13,21" fill="#FDE047" stroke="#CA8A04" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  );
}

export function ImageIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="4" width="18" height="16" rx="2" fill="#F0FDF4" stroke="#16A34A" strokeWidth="1.5"/>
      <circle cx="8" cy="8.5" r="2" fill="#FBBF24"/>
      <path d="M3 16L8 11L14 17L17 14L21 18V18C21 19.1046 20.1046 20 19 20H5C3.89543 20 3 19.1046 3 18V16Z" fill="#4ADE80" stroke="#16A34A" strokeWidth="1.2"/>
    </svg>
  );
}

export function TableIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="4" width="18" height="16" rx="2" fill="#FFFFFF" stroke="#0284C7" strokeWidth="1.5"/>
      <path d="M3 9H21" stroke="#0284C7" strokeWidth="1.5"/>
      <path d="M3 15H21" stroke="#CBD5E1" strokeWidth="1.2"/>
      <path d="M9 4V20M15 4V20" stroke="#CBD5E1" strokeWidth="1.2"/>
      <rect x="3" y="4" width="18" height="5" fill="#BAE6FD" opacity="0.6"/>
    </svg>
  );
}

export function EquationIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="18" height="18" rx="2.5" fill="#FAF5FF" stroke="#9333EA" strokeWidth="1.2"/>
      <path d="M6 7H14L10 12L14 17H6" stroke="#9333EA" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
      <text x="14" y="11" fill="#7E22CE" fontSize="7" fontWeight="bold">2</text>
      <text x="14" y="17" fill="#7E22CE" fontSize="8" fontWeight="bold">x</text>
    </svg>
  );
}

export function SymbolIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 6L18 18M6 18L18 6" stroke="#0284C7" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="12" cy="5" r="1.5" fill="#0284C7"/>
      <circle cx="12" cy="19" r="1.5" fill="#0284C7"/>
      <circle cx="5" cy="12" r="1.5" fill="#0284C7"/>
      <circle cx="19" cy="12" r="1.5" fill="#0284C7"/>
    </svg>
  );
}

export function CharShapeIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <text x="3" y="17" fill="#0066CC" fontSize="15" fontWeight="bold" fontFamily="serif">가</text>
      <path d="M14 18L19 13L21 15L16 20L13 21L14 18Z" fill="#F59E0B" stroke="#D97706" strokeWidth="1"/>
      <path d="M18 12L20 10L22 12L20 14L18 12Z" fill="#EF4444"/>
    </svg>
  );
}

export function ParaShapeIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="4" y1="5" x2="16" y2="5" stroke="#475569" strokeWidth="2" strokeLinecap="round"/>
      <line x1="4" y1="9" x2="20" y2="9" stroke="#475569" strokeWidth="2" strokeLinecap="round"/>
      <line x1="4" y1="13" x2="14" y2="13" stroke="#475569" strokeWidth="2" strokeLinecap="round"/>
      <line x1="4" y1="17" x2="18" y2="17" stroke="#475569" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="18" cy="17" r="4" fill="#22C55E"/>
      <path d="M16 17L17.5 18.5L20 15.5" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function HeaderIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="3" width="16" height="18" rx="2" fill="#FFFFFF" stroke="#64748B" strokeWidth="1.5"/>
      <rect x="6" y="5" width="12" height="3.5" rx="0.5" fill="#F59E0B"/>
      <line x1="6" y1="12" x2="18" y2="12" stroke="#CBD5E1" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="6" y1="15" x2="15" y2="15" stroke="#CBD5E1" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="6" y1="18" x2="12" y2="18" stroke="#CBD5E1" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

export function FooterIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="3" width="16" height="18" rx="2" fill="#FFFFFF" stroke="#64748B" strokeWidth="1.5"/>
      <line x1="6" y1="7" x2="18" y2="7" stroke="#CBD5E1" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="6" y1="10" x2="15" y2="10" stroke="#CBD5E1" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="6" y1="13" x2="12" y2="13" stroke="#CBD5E1" strokeWidth="1.2" strokeLinecap="round"/>
      <rect x="6" y="16.5" width="12" height="3" rx="0.5" fill="#F59E0B"/>
    </svg>
  );
}

export function ParaMarkIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 4V20M17 4V20M13 4H9C6.79086 4 5 5.79086 5 8C5 10.2091 6.79086 12 9 12H17" stroke="#0066CC" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M19 16L21 18L19 20" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function GridIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="18" height="18" rx="2" fill="#FFFFFF" stroke="#64748B" strokeWidth="1.5"/>
      <line x1="3" y1="9" x2="21" y2="9" stroke="#94A3B8" strokeWidth="1"/>
      <line x1="3" y1="15" x2="21" y2="15" stroke="#94A3B8" strokeWidth="1"/>
      <line x1="9" y1="3" x2="9" y2="21" stroke="#94A3B8" strokeWidth="1"/>
      <line x1="15" y1="3" x2="15" y2="21" stroke="#94A3B8" strokeWidth="1"/>
    </svg>
  );
}

// ── 하단 빠른 서식 바 아이콘 ──

export function UndoIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 9H15C17.7614 9 20 11.2386 20 14C20 16.7614 17.7614 19 15 19H7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
      <path d="M8 5L4 9L8 13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function RedoIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 9H9C6.23858 9 4 11.2386 4 14C4 16.7614 6.23858 19 9 19H17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
      <path d="M16 5L20 9L16 13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function AlignJustifyIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="3" y1="5" x2="21" y2="5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
      <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
      <line x1="3" y1="15" x2="21" y2="15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
      <line x1="3" y1="20" x2="21" y2="20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  );
}

export function AlignLeftIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="3" y1="5" x2="21" y2="5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
      <line x1="3" y1="10" x2="15" y2="10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
      <line x1="3" y1="15" x2="19" y2="15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
      <line x1="3" y1="20" x2="13" y2="20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  );
}

export function AlignCenterIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="3" y1="5" x2="21" y2="5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
      <line x1="6" y1="10" x2="18" y2="10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
      <line x1="4" y1="15" x2="20" y2="15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
      <line x1="7" y1="20" x2="17" y2="20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  );
}

export function AlignRightIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="3" y1="5" x2="21" y2="5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
      <line x1="9" y1="10" x2="21" y2="10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
      <line x1="5" y1="15" x2="21" y2="15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
      <line x1="11" y1="20" x2="21" y2="20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  );
}

export function HighlighterIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14.5 4.5L19.5 9.5L10 19H5V14L14.5 4.5Z" fill="#FEF08A" stroke="#CA8A04" strokeWidth="1.5" strokeLinejoin="round"/>
      <line x1="12" y1="7" x2="17" y2="12" stroke="#CA8A04" strokeWidth="1.5"/>
      <path d="M4 21H20" stroke="#EAB308" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}

export function LineSpacingIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 6L4 9M4 9L7 12M4 9H11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7 18L4 15M4 15L7 12M4 15H11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="14" y1="6" x2="21" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="14" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="14" y1="18" x2="21" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

export function IndentDecIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 8L3 12L7 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="11" y1="6" x2="21" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="11" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="11" y1="18" x2="21" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

export function IndentIncIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 8L7 12L3 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="11" y1="6" x2="21" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="11" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="11" y1="18" x2="21" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

export function TrashIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 7H20M10 11V17M14 11V17M5 7L6 19C6 20.1046 6.89543 21 8 21H16C17.1046 21 18 20.1046 18 19L19 7M9 7V4C9 3.44772 9.44772 3 10 3H14C14.5523 3 15 3.44772 15 4V7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ── 한컴오피스 탭별 전용 리본 추가 아이콘 ──

export function PrintIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 8V3H17V8" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M19 14H21C21.5523 14 22 13.5523 22 13V9C22 8.44772 21.5523 8 21 8H3C2.44772 8 2 8.44772 2 9V13C2 13.5523 2.44772 14 3 14H5" stroke="#334155" strokeWidth="1.5"/>
      <rect x="5" y="12" width="14" height="9" rx="1.5" fill="#F8FAFC" stroke="#0284C7" strokeWidth="1.5"/>
      <line x1="8" y1="15" x2="16" y2="15" stroke="#94A3B8" strokeWidth="1.2" strokeLinecap="round"/>
      <line x1="8" y1="18" x2="13" y2="18" stroke="#94A3B8" strokeWidth="1.2" strokeLinecap="round"/>
      <circle cx="18" cy="11" r="1" fill="#10B981"/>
    </svg>
  );
}

export function DocInfoIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="3" width="16" height="18" rx="2" fill="#EFF6FF" stroke="#2563EB" strokeWidth="1.5"/>
      <circle cx="12" cy="8" r="1.5" fill="#2563EB"/>
      <path d="M12 11V16M11 11H12M11 16H13" stroke="#2563EB" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M7 19H17" stroke="#93C5FD" strokeWidth="1.2"/>
    </svg>
  );
}

export function ReplaceIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="9" cy="9" r="6" stroke="#0284C7" strokeWidth="1.5"/>
      <path d="M13.5 13.5L20 20" stroke="#0284C7" strokeWidth="2" strokeLinecap="round"/>
      <path d="M7 6L5 8L7 10" stroke="#059669" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5 8H12" stroke="#059669" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M11 12L13 10L11 8" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M13 10H6" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

export function PageBreakIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 4H19M5 20H19" stroke="#475569" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M3 12H21" stroke="#EF4444" strokeWidth="1.5" strokeDasharray="3 3"/>
      <path d="M9 8L12 5L15 8M9 16L12 19L15 16" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function PageSetupIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="3" width="14" height="18" rx="1.5" fill="#FFFFFF" stroke="#0284C7" strokeWidth="1.5"/>
      <rect x="7" y="5" width="10" height="14" fill="#F0F9FF" stroke="#BAE6FD" strokeWidth="1" strokeDasharray="2 2"/>
      <line x1="2" y1="9" x2="5" y2="9" stroke="#0284C7" strokeWidth="1.2"/>
      <line x1="2" y1="15" x2="5" y2="15" stroke="#0284C7" strokeWidth="1.2"/>
    </svg>
  );
}

export function ZoomInIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="11" cy="11" r="7" stroke="#475569" strokeWidth="1.75"/>
      <path d="M16 16L21 21" stroke="#475569" strokeWidth="2.2" strokeLinecap="round"/>
      <line x1="11" y1="8" x2="11" y2="14" stroke="#0284C7" strokeWidth="1.75" strokeLinecap="round"/>
      <line x1="8" y1="11" x2="14" y2="11" stroke="#0284C7" strokeWidth="1.75" strokeLinecap="round"/>
    </svg>
  );
}

export function ZoomOutIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="11" cy="11" r="7" stroke="#475569" strokeWidth="1.75"/>
      <path d="M16 16L21 21" stroke="#475569" strokeWidth="2.2" strokeLinecap="round"/>
      <line x1="8" y1="11" x2="14" y2="11" stroke="#0284C7" strokeWidth="1.75" strokeLinecap="round"/>
    </svg>
  );
}

export function ShortcutsIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="5" width="18" height="14" rx="2.5" fill="#F8FAFC" stroke="#64748B" strokeWidth="1.5"/>
      <rect x="6" y="8" width="3" height="3" rx="0.5" fill="#94A3B8"/>
      <rect x="10.5" y="8" width="3" height="3" rx="0.5" fill="#94A3B8"/>
      <rect x="15" y="8" width="3" height="3" rx="0.5" fill="#94A3B8"/>
      <rect x="7" y="13" width="10" height="3" rx="0.5" fill="#3B82F6"/>
    </svg>
  );
}

export function SpellCheckIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <text x="3" y="16" fill="#1E293B" fontSize="14" fontWeight="bold">가</text>
      <path d="M12 14L15 17L21 11" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function AddRowIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="4" width="18" height="16" rx="1.5" fill="#FFFFFF" stroke="#0284C7" strokeWidth="1.5"/>
      <line x1="3" y1="12" x2="21" y2="12" stroke="#0284C7" strokeWidth="1.2"/>
      <line x1="9" y1="4" x2="9" y2="20" stroke="#BAE6FD" strokeWidth="1"/>
      <line x1="15" y1="4" x2="15" y2="20" stroke="#BAE6FD" strokeWidth="1"/>
      <circle cx="18" cy="18" r="4.5" fill="#10B981"/>
      <path d="M18 16V20M16 18H20" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

export function AddColIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="4" width="18" height="16" rx="1.5" fill="#FFFFFF" stroke="#0284C7" strokeWidth="1.5"/>
      <line x1="12" y1="4" x2="12" y2="20" stroke="#0284C7" strokeWidth="1.2"/>
      <line x1="3" y1="10" x2="21" y2="10" stroke="#BAE6FD" strokeWidth="1"/>
      <line x1="3" y1="16" x2="21" y2="16" stroke="#BAE6FD" strokeWidth="1"/>
      <circle cx="18" cy="18" r="4.5" fill="#10B981"/>
      <path d="M18 16V20M16 18H20" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

export function DeleteRowColIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="4" width="18" height="16" rx="1.5" fill="#FFFFFF" stroke="#0284C7" strokeWidth="1.5"/>
      <line x1="3" y1="12" x2="21" y2="12" stroke="#0284C7" strokeWidth="1.2"/>
      <line x1="12" y1="4" x2="12" y2="20" stroke="#0284C7" strokeWidth="1.2"/>
      <circle cx="18" cy="18" r="4.5" fill="#EF4444"/>
      <path d="M16 18H20" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

export function SelectAllIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="18" height="18" rx="2" fill="#DBEAFE" stroke="#2563EB" strokeWidth="1.5" strokeDasharray="3 3"/>
      <line x1="7" y1="8" x2="17" y2="8" stroke="#1D4ED8" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="7" y1="12" x2="15" y2="12" stroke="#1D4ED8" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="7" y1="16" x2="13" y2="16" stroke="#1D4ED8" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

export function BulletListIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="5" cy="7" r="2" fill="currentColor"/>
      <circle cx="5" cy="12" r="2" fill="currentColor"/>
      <circle cx="5" cy="17" r="2" fill="currentColor"/>
      <line x1="10" y1="7" x2="20" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="10" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="10" y1="17" x2="20" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

export function NumberListIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <text x="2" y="9" fill="currentColor" fontSize="8" fontWeight="bold">1.</text>
      <text x="2" y="15" fill="currentColor" fontSize="8" fontWeight="bold">2.</text>
      <text x="2" y="21" fill="currentColor" fontSize="8" fontWeight="bold">3.</text>
      <line x1="10" y1="7" x2="20" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="10" y1="13" x2="20" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="10" y1="19" x2="20" y2="19" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

export function FootnoteIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="3" width="16" height="18" rx="2" fill="#F8FAFC" stroke="#64748B" strokeWidth="1.5"/>
      <line x1="7" y1="7" x2="17" y2="7" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round"/>
      <text x="14" y="6" fill="#3B82F6" fontSize="6" fontWeight="bold">1)</text>
      <line x1="7" y1="11" x2="15" y2="11" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="6" y1="15" x2="18" y2="15" stroke="#CBD5E1" strokeWidth="1" strokeDasharray="2 2"/>
      <text x="7" y="19" fill="#2563EB" fontSize="5" fontWeight="bold">1) 각주</text>
    </svg>
  );
}

export function TextBoxIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="4" width="18" height="16" rx="2" fill="#EFF6FF" stroke="#3B82F6" strokeWidth="1.5" strokeDasharray="3 3"/>
      <text x="6" y="15" fill="#1D4ED8" fontSize="11" fontWeight="bold" fontFamily="sans-serif">가</text>
      <line x1="12" y1="10" x2="18" y2="10" stroke="#93C5FD" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="12" y1="14" x2="17" y2="14" stroke="#93C5FD" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

export function CaptionIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="4" width="16" height="11" rx="1.5" fill="#E2E8F0" stroke="#64748B" strokeWidth="1.5"/>
      <rect x="6" y="6" width="12" height="7" rx="1" fill="#FFFFFF"/>
      <rect x="5" y="17" width="14" height="3" rx="1" fill="#3B82F6"/>
    </svg>
  );
}

export function HyperlinkIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="#2563EB" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

export function ColumnsIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="4" width="7" height="16" rx="1" fill="#DBEAFE" stroke="#3B82F6" strokeWidth="1.5"/>
      <rect x="13" y="4" width="7" height="16" rx="1" fill="#DBEAFE" stroke="#3B82F6" strokeWidth="1.5"/>
    </svg>
  );
}

export function PageNumberIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="3" width="14" height="18" rx="2" fill="#FFFFFF" stroke="#64748B" strokeWidth="1.5"/>
      <line x1="8" y1="7" x2="16" y2="7" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="8" y1="11" x2="14" y2="11" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="12" cy="17" r="2.5" fill="#3B82F6"/>
      <text x="12" y="19" fill="#FFFFFF" fontSize="4" fontWeight="bold" textAnchor="middle">1</text>
    </svg>
  );
}

export function WatermarkIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="3" width="16" height="18" rx="2" fill="#FFFFFF" stroke="#64748B" strokeWidth="1.5"/>
      <text x="12" y="14" fill="#EF4444" opacity="0.4" fontSize="6" fontWeight="bold" textAnchor="middle" transform="rotate(-30 12 14)">대외비</text>
    </svg>
  );
}

export function TemplateIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="4" width="16" height="16" rx="2" fill="#FEF3C7" stroke="#D97706" strokeWidth="1.5"/>
      <path d="M7 8H17M7 12H14M7 16H11" stroke="#B45309" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="17" cy="16" r="2" fill="#F59E0B"/>
    </svg>
  );
}

export function CommentIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" fill="#FEF08A" stroke="#CA8A04" strokeWidth="1.5"/>
      <line x1="8" y1="11" x2="16" y2="11" stroke="#A16207" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

export function ChartIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="18" height="18" rx="2" fill="#F0FDF4" stroke="#16A34A" strokeWidth="1.5"/>
      <rect x="6" y="12" width="3" height="7" fill="#22C55E"/>
      <rect x="11" y="8" width="3" height="11" fill="#16A34A"/>
      <rect x="16" y="5" width="3" height="14" fill="#15803D"/>
    </svg>
  );
}

export function TocIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 6H8M11 6H17M19 6H20" stroke="#2563EB" strokeWidth="2" strokeLinecap="round"/>
      <path d="M4 12H8M11 12H17M19 12H20" stroke="#2563EB" strokeWidth="2" strokeLinecap="round"/>
      <path d="M4 18H8M11 18H17M19 18H20" stroke="#2563EB" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

export function MergeCellIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="5" width="18" height="14" rx="2" fill="#EFF6FF" stroke="#3B82F6" strokeWidth="1.5"/>
      <path d="M8 12H16M13 9L16 12L13 15M11 9L8 12L11 15" stroke="#1D4ED8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function SplitCellIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="5" width="18" height="14" rx="2" fill="#F8FAFC" stroke="#64748B" strokeWidth="1.5"/>
      <line x1="12" y1="5" x2="12" y2="19" stroke="#EF4444" strokeWidth="1.5" strokeDasharray="2 2"/>
      <path d="M7 12L5 12M17 12L19 12" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

export function CalcIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="3" width="14" height="18" rx="2" fill="#F1F5F9" stroke="#475569" strokeWidth="1.5"/>
      <rect x="7" y="5" width="10" height="4" rx="1" fill="#CBD5E1"/>
      <circle cx="8.5" cy="12" r="1" fill="#475569"/>
      <circle cx="12" cy="12" r="1" fill="#475569"/>
      <circle cx="15.5" cy="12" r="1" fill="#475569"/>
      <circle cx="8.5" cy="15" r="1" fill="#475569"/>
      <circle cx="12" cy="15" r="1" fill="#475569"/>
      <circle cx="15.5" cy="15" r="1" fill="#475569"/>
      <rect x="7.5" y="17.5" width="9" height="1.5" rx="0.75" fill="#3B82F6"/>
    </svg>
  );
}

export function TextConvertIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <text x="3" y="14" fill="#1E293B" fontSize="11" fontWeight="bold">A</text>
      <path d="M12 10L14 12L12 14" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <text x="16" y="14" fill="#3B82F6" fontSize="11" fontWeight="bold">a</text>
    </svg>
  );
}

export function SuperscriptIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <text x="2" y="18" fill="currentColor" fontSize="15" fontWeight="bold">X</text>
      <text x="14" y="9" fill="currentColor" fontSize="9" fontWeight="bold">2</text>
    </svg>
  );
}

export function SubscriptIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <text x="2" y="18" fill="currentColor" fontSize="15" fontWeight="bold">X</text>
      <text x="14" y="21" fill="currentColor" fontSize="9" fontWeight="bold">2</text>
    </svg>
  );
}

// 한컴독스(Hancom Docs) 상단 바 및 메뉴바 전용 신규 아이콘
export function HancomDocsAppLogo({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="28" height="28" rx="6" fill="#1A73E8"/>
      <path d="M7 6C7 4.89543 7.89543 4 9 4H19L23 8V22C23 23.1046 22.1046 24 21 24H9C7.89543 24 7 23.1046 7 22V6Z" fill="#38B6FF" opacity="0.4"/>
      <rect x="5" y="6" width="18" height="18" rx="3" fill="#0066DA"/>
      <circle cx="14" cy="11.5" r="1.5" fill="#FFFFFF"/>
      <rect x="10" y="14" width="8" height="1.8" rx="0.9" fill="#FFFFFF"/>
      <circle cx="14" cy="18.5" r="2.5" stroke="#FFFFFF" strokeWidth="1.6"/>
    </svg>
  );
}

export function SaveAsIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17 21H5C3.89543 21 3 20.1046 3 19V5C3 3.89543 3.89543 3 5 3H14L19 8V14" stroke="#475569" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M7 3V7H13V3" stroke="#475569" strokeWidth="1.2"/>
      <path d="M6 13H15V21H6V13Z" fill="#FFFFFF" stroke="#475569" strokeWidth="1.2"/>
      <path d="M19 16V22M16 19H22" stroke="#0284C7" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

export function ShareIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="18" cy="5" r="3" stroke="#475569" strokeWidth="1.5"/>
      <circle cx="6" cy="12" r="3" stroke="#475569" strokeWidth="1.5"/>
      <circle cx="18" cy="19" r="3" stroke="#475569" strokeWidth="1.5"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" stroke="#475569" strokeWidth="1.5"/>
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" stroke="#475569" strokeWidth="1.5"/>
    </svg>
  );
}

export function RenameIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 20H8L18.5 9.5C19.3284 8.67157 19.3284 7.32843 18.5 6.5C17.6716 5.67157 16.3284 5.67157 15.5 6.5L5 17V20H4Z" stroke="#475569" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M13.5 8.5L16.5 11.5" stroke="#475569" strokeWidth="1.5"/>
    </svg>
  );
}

export function DownloadTrayIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 17V19C4 20.1046 4.89543 21 6 21H18C19.1046 21 20 20.1046 20 19V17" stroke="#475569" strokeWidth="1.75" strokeLinecap="round"/>
      <path d="M12 3V15M12 15L7 10M12 15L17 10" stroke="#0284C7" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function PdfDownloadIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2Z" fill="#FEE2E2" stroke="#DC2626" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M14 2V8H20" stroke="#DC2626" strokeWidth="1.5"/>
      <rect x="6" y="11" width="12" height="7" rx="1" fill="#DC2626"/>
      <text x="7" y="16.5" fill="#FFFFFF" fontSize="5" fontWeight="bold" fontFamily="sans-serif">PDF</text>
    </svg>
  );
}

export function GotoIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="#0284C7" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="#0284C7" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M13 19L21 19M21 19L17 15M21 19L17 23" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function EraserIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="6" width="16" height="12" rx="1.5" stroke="#93C5FD" strokeWidth="1.5" strokeDasharray="2 2"/>
      <line x1="5" y1="17" x2="19" y2="7" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

export function ClearControlMarksIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <text x="3" y="12" fill="#475569" fontSize="10" fontWeight="bold">##</text>
      <rect x="2" y="3" width="13" height="11" fill="none" stroke="#94A3B8" strokeWidth="1"/>
      <path d="M15 15L21 21M21 15L15 21" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}

export function WebVideoIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="#64748B" strokeWidth="1.5"/>
      <ellipse cx="12" cy="12" rx="4" ry="9" stroke="#94A3B8" strokeWidth="1.2"/>
      <line x1="3" y1="12" x2="21" y2="12" stroke="#94A3B8" strokeWidth="1.2"/>
      <circle cx="16" cy="16" r="5" fill="#FFFFFF" stroke="#0284C7" strokeWidth="1.5"/>
      <polygon points="15,14 18,16 15,18" fill="#0284C7"/>
    </svg>
  );
}

export function EndnoteIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="3" width="14" height="18" rx="1.5" fill="#FFFFFF" stroke="#64748B" strokeWidth="1.5"/>
      <text x="7" y="10" fill="#16A34A" fontSize="7" fontWeight="bold">[i]</text>
      <line x1="8" y1="14" x2="16" y2="14" stroke="#CBD5E1" strokeWidth="1.5"/>
      <line x1="8" y1="17" x2="14" y2="17" stroke="#CBD5E1" strokeWidth="1.5"/>
    </svg>
  );
}

export function SafeFontIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" fill="#ECFDF5" stroke="#10B981" strokeWidth="1.5"/>
      <path d="M9 12L11 14L15 10" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 17V20M10 20H14" stroke="#059669" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

export function AlignDistributeIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}


