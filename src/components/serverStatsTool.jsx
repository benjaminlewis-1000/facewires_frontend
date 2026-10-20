import React from 'react';
import '../css/serverStats.css';

// Purely presentational - the actual fetch/10-minute background refresh
// lives in picasaScreen.jsx (fetchServerStats), same reasoning as
// uploads/photoWatches there: fetched eagerly on page load rather than
// lazily on this component's own mount, so the numbers are already warm
// by the time anyone opens this tab, and kept current even while a
// different tab is showing.

function formatNum(n) {
  return (n || 0).toLocaleString()
}

// Single reusable bar for every numerator/denominator progress metric
// this page shows (face-processing, verified-progress, both video ones) -
// percent drives the fill width, detailText is free-form so each call
// site can show whatever counts/duration text makes sense for it.
function StatBar({ label, percent, detailText }) {
  const clamped = Math.max(0, Math.min(100, percent || 0))
  return (
    <div className='statBarRow'>
      <div className='statBarHeader'>
        <span className='statBarLabel'>{label}</span>
        <span className='statBarValue'>{detailText}</span>
      </div>
      <div className='statBarTrack'>
        <div className='statBarFill' style={{ width: `${clamped}%` }} />
      </div>
    </div>
  )
}

function StatTile({ label, value }) {
  return (
    <div className='statTile'>
      <div className='statTileValue'>{formatNum(value)}</div>
      <div className='statTileLabel'>{label}</div>
    </div>
  )
}

function CollectionCard({ c }) {
  const faceProcessedPercent = c.num_imgs ? (c.num_face_processed / c.num_imgs) * 100 : 0
  const verifiedPercent = c.num_tagged ? (c.num_verified / c.num_tagged) * 100 : 0

  return (
    <div className='collectionCard'>
      <div className='collectionCardHeader'>
        {c.name}
        {c.is_default && <span className='collectionDefaultBadge'>Default</span>}
      </div>
      <div className='collectionCardCounts'>
        <span>{formatNum(c.num_imgs)} images</span>
        <span>{formatNum(c.num_people)} people</span>
        <span>{formatNum(c.num_faces)} faces</span>
      </div>
      <StatBar
        label='Face processing'
        percent={faceProcessedPercent}
        detailText={`${formatNum(c.num_face_processed)} / ${formatNum(c.num_imgs)} (${c.percent_face_processed})`}
      />
      <StatBar
        label='Verified'
        percent={verifiedPercent}
        detailText={`${formatNum(c.num_verified)} / ${formatNum(c.num_tagged)} (${c.verified_progress})`}
      />
    </div>
  )
}

function ServerStatsTool({ stats, loading, loadError, onRetry }) {
  if (loading && !stats) return <p>Loading server stats&hellip;</p>
  if (loadError && !stats) {
    return (
      <div>
        <p className='serverStatsError'>{loadError}</p>
        <button onClick={onRetry}>Retry</button>
      </div>
    )
  }

  const s = stats
  const faceProcessedPercent = s.num_imgs ? (s.num_face_processed / s.num_imgs) * 100 : 0
  const verifiedPercent = s.num_tagged ? (s.num_verified / s.num_tagged) * 100 : 0
  const videoCountPercent = s.num_videos ? (s.num_videos_processed / s.num_videos) * 100 : 0
  // No raw seconds exposed to the frontend for the duration bar - the
  // backend already computes this percentage itself, so parse its string
  // rather than re-deriving from the two duration strings, which aren't
  // meant for arithmetic.
  const videoDurationPercent = parseFloat(s.percent_video_length_processed) || 0

  return (
    <div className='serverStatsTool'>
      <div className='serverStatsGlobal'>
        <div className='statTileRow'>
          <StatTile label='Images' value={s.num_imgs} />
          <StatTile label='Faces' value={s.num_faces} />
          <StatTile label='People' value={s.num_people} />
          <StatTile label='Videos' value={s.num_videos} />
        </div>
        <StatBar
          label='Face processing'
          percent={faceProcessedPercent}
          detailText={`${formatNum(s.num_face_processed)} / ${formatNum(s.num_imgs)} (${s.percent_face_processed})`}
        />
        <StatBar
          label='Verified progress'
          percent={verifiedPercent}
          detailText={`${formatNum(s.num_verified)} / ${formatNum(s.num_tagged)} (${s.verified_progress})`}
        />
        <StatBar
          label='Video count processed'
          percent={videoCountPercent}
          detailText={`${formatNum(s.num_videos_processed)} / ${formatNum(s.num_videos)} (${s.percent_video_processed})`}
        />
        <StatBar
          label='Video duration processed'
          percent={videoDurationPercent}
          detailText={`${s.unprocessed_video_length} remaining of ${s.total_video_length} (${s.percent_video_length_processed})`}
        />
        <div className='serverStatsFootnote'>
          Est. {s.estimated_hours_facerec_left.toFixed(1)}h of face processing left at
          {' '}~{formatNum(s.imgs_per_hour_est)} images/hour.
          {s.num_videos_failed > 0 && ` ${formatNum(s.num_videos_failed)} video(s) failed face extraction.`}
        </div>
      </div>

      <div className='serverStatsCollectionsHeader'>Collections</div>
      <div className='serverStatsCollections'>
        {s.by_collection.map(c => <CollectionCard key={c.name} c={c} />)}
      </div>
    </div>
  )
}

export default ServerStatsTool
