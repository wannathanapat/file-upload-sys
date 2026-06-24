"use client";

import React from 'react';

export default function CustomPdfViewer({ url }: { url: string }) {
  // Append PDF display parameters:
  // - toolbar=0: hides the top dark control bar
  // - navpanes=0: hides the side thumbnail panel
  // - view=FitH: fits the document page horizontally to fill the width
  const viewerUrl = `${url}#toolbar=0&navpanes=0&view=FitH`;

  return (
    <div className="w-full h-full bg-slate-950 flex items-center justify-center relative overflow-hidden rounded-2xl">
      <iframe
        src={viewerUrl}
        className="absolute border-0 bg-slate-950"
        style={{
          top: 0,
          left: 0,
          width: 'calc(100% + 18px)',
          height: 'calc(100% + 18px)',
          overflow: 'hidden',
        }}
        title="File Viewer"
        allowFullScreen
      />
    </div>
  );
}
