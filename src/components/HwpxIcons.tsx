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
