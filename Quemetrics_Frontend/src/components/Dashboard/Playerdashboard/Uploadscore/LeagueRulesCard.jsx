import React from 'react';
import { FaClipboard, FaInfoCircle, FaTrophy, FaCheckCircle, FaCamera } from 'react-icons/fa';

function prettifyFormatKey(val) {
  if (val == null || val === '') return 'N/A';
  return String(val)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * LeagueRulesCard Component
 * Displays comprehensive league/tournament rules and match format information
 * on the Upload Score page before players enter match results
 * Works for both League and Tournament matches
 */
export default function LeagueRulesCard({ matchDetails, config }) {
  if (!matchDetails || !config) return null;

  const isTournament = matchDetails.matchType === 'tournament';

  // Map reporting method to confirmationRequired format
  const getConfirmationRequired = () => {
    if (config.reporting?.method) {
      switch (config.reporting.method) {
        case 'bothConfirm':
          return 'both_players';
        case 'oneSubmit':
          return 'one_player';
        case 'adminOnly':
          return 'admin_only';
        case 'none':
          return 'none';
        default:
          return 'both_players'; // default fallback
      }
    }
    return 'both_players'; // default fallback
  };

  const confirmationRequired = getConfirmationRequired();

  const league = matchDetails.league;
  const tournament = matchDetails.tournament;
  const division = matchDetails.division;

  return (
    <div className="space-y-4">
      {/* League / tournament context */}
      {league && (
        <div className={`bg-gradient-to-r rounded-xl p-6 shadow-sm border ${isTournament ? 'from-purple-50 to-indigo-50 border-purple-200' : 'from-blue-50 to-cyan-50 border-blue-200'}`}>
          <h3 className={`font-bold text-lg mb-4 flex items-center gap-2 ${isTournament ? 'text-purple-900' : 'text-blue-900'}`}>
            {isTournament ? (
              <><FaTrophy className="text-purple-600" /> Tournament Information</>
            ) : (
              <><FaInfoCircle className="text-blue-600" /> League Information</>
            )}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className={`bg-white rounded-lg p-3 border ${isTournament ? 'border-purple-100' : 'border-blue-100'}`}>
              <div className="text-xs text-gray-500 font-medium uppercase">{isTournament ? 'Tournament' : 'League'}</div>
              <div className="text-sm font-bold text-gray-900">{league.name || 'N/A'}</div>
            </div>
            <div className={`bg-white rounded-lg p-3 border ${isTournament ? 'border-purple-100' : 'border-blue-100'}`}>
              <div className="text-xs text-gray-500 font-medium uppercase">Type</div>
              <div className="text-sm font-bold text-gray-900">
                {isTournament || league.leagueType === 'tournament'
                  ? '🏆 Bracket'
                  : league.leagueType
                    ? (league.leagueType === 'rolling' ? '🔄 Rolling' : '📋 Fixed')
                    : 'N/A'}
              </div>
            </div>
            <div className={`bg-white rounded-lg p-3 border ${isTournament ? 'border-purple-100' : 'border-blue-100'}`}>
              <div className="text-xs text-gray-500 font-medium uppercase">Format</div>
              <div className="text-sm font-bold text-gray-900">{prettifyFormatKey(league.format)}</div>
            </div>
            <div className={`bg-white rounded-lg p-3 border ${isTournament ? 'border-purple-100' : 'border-blue-100'}`}>
              <div className="text-xs text-gray-500 font-medium uppercase">{isTournament ? 'Bracket' : 'Division'}</div>
              <div className="text-sm font-bold text-gray-900">
                {isTournament && matchDetails.fixture
                  ? `Round ${matchDetails.fixture.round ?? '—'} · Match ${matchDetails.fixture.matchNumber ?? '—'}`
                  : (division?.name || 'Main')}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tournament Information Section (legacy: explicit tournament node only) */}
      {!league && tournament && (
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-6 shadow-sm">
          <h3 className="font-bold text-lg text-purple-900 mb-4 flex items-center gap-2">
            <FaTrophy className="text-purple-600" /> Tournament Information
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg p-3 border border-purple-100">
              <div className="text-xs text-gray-500 font-medium uppercase">Tournament</div>
              <div className="text-sm font-bold text-gray-900">{tournament.name || 'N/A'}</div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-purple-100">
              <div className="text-xs text-gray-500 font-medium uppercase">Format</div>
              <div className="text-sm font-bold text-gray-900">{tournament.format || 'N/A'}</div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-purple-100">
              <div className="text-xs text-gray-500 font-medium uppercase">Sport</div>
              <div className="text-sm font-bold text-gray-900">{tournament.sport ? tournament.sport.charAt(0).toUpperCase() + tournament.sport.slice(1) : 'N/A'}</div>
            </div>
          </div>
        </div>
      )}

      {/* Tournament points from organizer setup (group standings / walkover points) */}
      {matchDetails.scoring && (
        <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 rounded-xl p-6 shadow-sm">
          <h3 className="font-bold text-lg text-indigo-900 mb-4 flex items-center gap-2">
            <FaTrophy className="text-indigo-600" /> Points (tournament setup)
          </h3>
          <p className="text-xs text-gray-600 mb-3">
            These values come from the organizer&apos;s scoring step when the tournament was created. Walkover wins use the
            walkover points for standings where applicable.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['Win', matchDetails.scoring.pointsWin],
              ['Draw', matchDetails.scoring.pointsDraw],
              ['Loss', matchDetails.scoring.pointsLoss],
              ['Walkover win', matchDetails.scoring.pointsWalkover],
            ].map(([label, val]) => (
              <div key={label} className="bg-white rounded-lg p-3 border border-indigo-100">
                <div className="text-xs text-gray-500 font-medium uppercase">{label}</div>
                <div className="text-lg font-bold text-gray-900">{val ?? '—'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Match Format Rules Section */}
      {config && (
        <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-xl p-6 shadow-sm">
          <h3 className="font-bold text-lg text-amber-900 mb-4 flex items-center gap-2">
            <FaClipboard className="text-amber-600" /> Match Format Rules
          </h3>
          <div className="space-y-3">
            {/* Match Type */}
            <div className="bg-white rounded-lg p-4 border border-amber-100">
              <div className="text-sm font-bold text-gray-800 mb-2">Format</div>
              {config.isRaceTo ? (
                <div className="text-base text-gray-700">
                  <strong className="text-amber-700">Race to {config.framesToWin}</strong>
                  <p className="text-xs text-gray-600 mt-1">First player to win {config.framesToWin} {config.framesToWin === 1 ? 'frame' : 'frames'} wins the match</p>
                </div>
              ) : config.isBestOf ? (
                <div className="text-base text-gray-700">
                  <strong className="text-amber-700">Best of {config.totalFrames}</strong>
                  <p className="text-xs text-gray-600 mt-1">First to win {config.framesToWin} out of {config.totalFrames} {config.totalFrames === 1 ? 'frame' : 'frames'}</p>
                </div>
              ) : (
                <div className="text-base text-gray-700">
                  <strong className="text-amber-700">Total Score Only</strong>
                </div>
              )}
            </div>

            {/* Score Detail Level */}
            {config.scoreDetail && (
              <div className="bg-white rounded-lg p-4 border border-amber-100">
                <div className="text-sm font-bold text-gray-800 mb-2">Score Entry Method</div>
                <div className="text-base text-gray-700">
                  {config.scoreDetail === 'frame_by_frame' ? (
                    <>
                      <strong className="text-amber-700">Frame-by-Frame Detail Required</strong>
                      <p className="text-xs text-gray-600 mt-1">You must enter the result of each individual frame/rack</p>
                    </>
                  ) : (
                    <>
                      <strong className="text-amber-700">Total Score Only</strong>
                      <p className="text-xs text-gray-600 mt-1">Enter only the final score without detailed frame breakdown</p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Handicap Rules Section */}
      {config?.handicap?.enabled && (
        <div className="bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-xl p-6 shadow-sm">
          <h3 className="font-bold text-lg text-orange-900 mb-4 flex items-center gap-2">
            <FaTrophy className="text-orange-600" /> Handicap System
          </h3>
          <div className="space-y-3">
            <div className="bg-white rounded-lg p-4 border border-orange-100">
              <div className="text-sm font-bold text-gray-800 mb-2">Handicap Type</div>
              <div className="text-base text-gray-700">
                {config.handicap.type === 'manual' && (
                  <>
                    <strong className="text-orange-700">Manual Handicap</strong>
                    <p className="text-xs text-gray-600 mt-1">Handicaps are set manually by league administrators</p>
                  </>
                )}
                {config.handicap.type === 'automatic' && (
                  <>
                    <strong className="text-orange-700">Automatic Handicap</strong>
                    <p className="text-xs text-gray-600 mt-1">Handicaps are calculated automatically based on player rankings</p>
                  </>
                )}
                {config.handicap.type === 'fixed' && (
                  <>
                    <strong className="text-orange-700">Fixed Handicap</strong>
                    <p className="text-xs text-gray-600 mt-1">All players receive the same handicap value</p>
                  </>
                )}
              </div>
            </div>

            {/* Display actual handicap values for this match */}
            <div className="bg-orange-100 rounded-lg p-4 border border-orange-200">
              <div className="text-sm font-bold text-gray-800 mb-3">Match Handicaps</div>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-lg font-bold text-blue-600">{matchDetails.player1?.name || 'Player 1'}</div>
                  <div className="text-2xl font-bold text-orange-700">+{config.handicap.player1 || 0}</div>
                  <div className="text-xs text-gray-600">handicap points</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-red-600">{matchDetails.player2?.name || 'Player 2'}</div>
                  <div className="text-2xl font-bold text-orange-700">+{config.handicap.player2 || 0}</div>
                  <div className="text-xs text-gray-600">handicap points</div>
                </div>
              </div>
              <div className="mt-3 text-xs text-gray-600 text-center">
                Handicap points are added to the raw score for final standings
              </div>
            </div>

            {config.handicap.dynamic && (
              <div className="bg-white rounded-lg p-4 border border-orange-100">
                <div className="text-sm font-bold text-gray-800 mb-2">Dynamic Adjustment</div>
                <div className="text-base text-gray-700">
                  <strong className="text-orange-700">✓ Dynamic Handicaps</strong>
                  <p className="text-xs text-gray-600 mt-1">Handicap values may change based on match results and performance</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Walkover Rules Section */}
      {config?.matchRules?.walkover && (
        <div className="bg-gradient-to-r from-gray-50 to-slate-50 border border-gray-200 rounded-xl p-6 shadow-sm">
          <h3 className="font-bold text-lg text-gray-900 mb-4 flex items-center gap-2">
            <FaClipboard className="text-gray-600" /> Walkover Rules
          </h3>
          <div className="space-y-3">
            <div className="bg-white rounded-lg p-4 border border-gray-100">
              <div className="text-sm font-bold text-gray-800 mb-2">Walkover Scoring</div>
              <div className="text-base text-gray-700">
                {config.matchRules.walkover.rule === 'autoBestOf' && (
                  <>
                    <strong className="text-gray-700">Best of {config.matchRules.bestOf === 'custom' ? config.matchRules.customFrames : config.matchRules.bestOf}</strong>
                    <p className="text-xs text-gray-600 mt-1">No-show results in automatic loss with score based on match format</p>
                  </>
                )}
                {config.matchRules.walkover.rule === 'auto2-0' && (
                  <>
                    <strong className="text-gray-700">Auto 2-0</strong>
                    <p className="text-xs text-gray-600 mt-1">No-show results in automatic 2-0 loss for the absent player</p>
                  </>
                )}
                {config.matchRules.walkover.rule === 'auto5-0' && (
                  <>
                    <strong className="text-gray-700">Auto 5-0</strong>
                    <p className="text-xs text-gray-600 mt-1">No-show results in automatic 5-0 loss for the absent player</p>
                  </>
                )}
                {config.matchRules.walkover.rule === 'custom' && config.matchRules.walkover.customScore && (
                  <>
                    <strong className="text-gray-700">Custom Score: {config.matchRules.walkover.customScore}</strong>
                    <p className="text-xs text-gray-600 mt-1">No-show results in custom score defined by league rules</p>
                  </>
                )}
                {config.matchRules.walkover.rule === 'admin' && (
                  <>
                    <strong className="text-gray-700">Admin Decision</strong>
                    <p className="text-xs text-gray-600 mt-1">League administrator decides walkover scoring on a case-by-case basis</p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation & Approval Rules */}
      {config && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6 shadow-sm">
          <h3 className="font-bold text-lg text-green-900 mb-4 flex items-center gap-2">
            <FaCheckCircle className="text-green-600" /> Confirmation & Approval Process
          </h3>
          <div className="space-y-3">
            {/* Confirmation Required */}
            <div className="bg-white rounded-lg p-4 border border-green-100">
              <div className="text-sm font-bold text-gray-800 mb-2">Who Must Confirm Result</div>
              <div className="text-base text-gray-700">
                {confirmationRequired === 'both_players' && (
                  <>
                    <strong className="text-green-700">✓ Both Players Must Confirm</strong>
                    <p className="text-xs text-gray-600 mt-1">Your opponent must agree with the score before it's recorded</p>
                  </>
                )}
                {confirmationRequired === 'one_player' && (
                  <>
                    <strong className="text-green-700">✓ Either Player Can Confirm</strong>
                    <p className="text-xs text-gray-600 mt-1">Result is recorded once any player submits the score</p>
                  </>
                )}
                {confirmationRequired === 'admin_only' && (
                  <>
                    <strong className="text-green-700">✓ Admin Approval Required</strong>
                    <p className="text-xs text-gray-600 mt-1">Score must be verified by league admin before recording</p>
                  </>
                )}
                {confirmationRequired === 'none' && (
                  <>
                    <strong className="text-green-700">✓ No Confirmation Needed</strong>
                    <p className="text-xs text-gray-600 mt-1">Result is recorded immediately after submission</p>
                  </>
                )}
              </div>
            </div>

            {/* Photo Proof Requirement */}
            {config.reporting?.photoProof !== undefined && (
              <div className="bg-white rounded-lg p-4 border border-green-100">
                <div className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-2">
                  <FaCamera className="text-green-600" /> Photo Proof
                </div>
                <div className="text-base text-gray-700">
                  {config.reporting.photoProof ? (
                    <>
                      <strong className="text-red-600">⚠️ REQUIRED</strong>
                      <p className="text-xs text-gray-600 mt-1">You must upload a photo of the score sheet or scoreboard</p>
                    </>
                  ) : (
                    <>
                      <strong className="text-green-700">Optional</strong>
                      <p className="text-xs text-gray-600 mt-1">Photo proof is not required but recommended</p>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Disputes Allowed */}
            {config.reporting?.dispute?.enabled !== undefined && (
              <div className="bg-white rounded-lg p-4 border border-green-100">
                <div className="text-sm font-bold text-gray-800 mb-2">Disputes & Appeals</div>
                <div className="text-base text-gray-700">
                  {config.reporting.dispute.enabled ? (
                    <>
                      <strong className="text-green-700">✓ Disputes Allowed</strong>
                      <p className="text-xs text-gray-600 mt-1">Your opponent can dispute the result if they disagree</p>
                    </>
                  ) : (
                    <>
                      <strong className="text-amber-700">✗ No Disputes</strong>
                      <p className="text-xs text-gray-600 mt-1">Results are final once both players confirm</p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scoring System - Points & Bonuses */}
      {config?.pointsSystem && Object.keys(config.pointsSystem).length > 0 && (
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-6 shadow-sm">
          <h3 className="font-bold text-lg text-purple-900 mb-4 flex items-center gap-2">
            <FaTrophy className="text-purple-600" /> Scoring Points ({isTournament ? 'this tournament' : 'this league'})
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {config.pointsSystem.win !== undefined && (
              <div className="bg-white rounded-lg p-3 border border-purple-100">
                <div className="text-xs text-gray-500 font-medium uppercase">Win</div>
                <div className="text-2xl font-bold text-green-600">{config.pointsSystem.win}</div>
                <div className="text-xs text-gray-600">points</div>
              </div>
            )}
            {config.pointsSystem.draw !== undefined && config.pointsSystem.draw > 0 && (
              <div className="bg-white rounded-lg p-3 border border-purple-100">
                <div className="text-xs text-gray-500 font-medium uppercase">Draw</div>
                <div className="text-2xl font-bold text-yellow-600">{config.pointsSystem.draw}</div>
                <div className="text-xs text-gray-600">points</div>
              </div>
            )}
            {config.pointsSystem.loss !== undefined && (
              <div className="bg-white rounded-lg p-3 border border-purple-100">
                <div className="text-xs text-gray-500 font-medium uppercase">Loss</div>
                <div className="text-2xl font-bold text-red-600">{config.pointsSystem.loss}</div>
                <div className="text-xs text-gray-600">points</div>
              </div>
            )}
            {config.pointsSystem.walkoverWin !== undefined && (
              <div className="bg-white rounded-lg p-3 border border-purple-100">
                <div className="text-xs text-gray-500 font-medium uppercase">Walkover</div>
                <div className="text-2xl font-bold text-blue-600">{config.pointsSystem.walkoverWin}</div>
                <div className="text-xs text-gray-600">points</div>
              </div>
            )}
          </div>

          {/* Bonuses */}
          {config.pointsSystem.bonuses && Object.keys(config.pointsSystem.bonuses).some(key => config.pointsSystem.bonuses[key]) && (
            <div className="mt-4 pt-4 border-t border-purple-200">
              <div className="text-sm font-semibold text-gray-700 mb-3">✨ Bonus Points:</div>
              <div className="space-y-2 text-sm">
                {config.pointsSystem.bonuses.whitewash && (
                  <div className="text-gray-700 bg-purple-50 rounded p-2">
                    • <strong>Whitewash (5-0):</strong> +{config.pointsSystem.bonuses.whitewashPoints || 2} points
                  </div>
                )}
                {config.pointsSystem.bonuses.participation && (
                  <div className="text-gray-700 bg-purple-50 rounded p-2">
                    • <strong>Participation:</strong> +{config.pointsSystem.bonuses.participationValue || 1} points/match
                  </div>
                )}
                {config.pointsSystem.bonuses.breakOverX && (
                  <div className="text-gray-700 bg-purple-50 rounded p-2">
                    • <strong>Break over {config.pointsSystem.bonuses.breakValue || 50}:</strong> +{config.pointsSystem.bonuses.breakPoints || 1} points
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tie-Breaking Rules */}
      {config?.tieBreakRules && config.tieBreakRules.length > 0 && (
        <div className="bg-gradient-to-r from-pink-50 to-rose-50 border border-pink-200 rounded-xl p-6 shadow-sm">
          <h3 className="font-bold text-lg text-pink-900 mb-4">Tie-Breaking Rules</h3>
          <div className="bg-white rounded-lg p-4 border border-pink-100">
            <p className="text-xs text-gray-600 mb-3 font-medium">If two players have the same points, these rules are applied in order:</p>
            <ol className="space-y-2">
              {config.tieBreakRules.map((rule, i) => (
                <li key={i} className="text-sm text-gray-800">
                  <span className="font-bold text-pink-600">{i + 1}.</span> {formatRuleName(rule)}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {/* Warning Box */}
      <div className="bg-yellow-50 border-l-4 border-yellow-400 rounded-lg p-4 text-sm text-yellow-800">
        <strong>📋 Important:</strong> Please ensure you understand all the rules above before submitting your match result.
        Incorrect scores may result in disputes and delays in updating{' '}
        {isTournament ? 'tournament standings and brackets' : 'league standings'}.
      </div>
    </div>
  );
}

/**
 * Format rule name for display
 */
function formatRuleName(rule) {
  const ruleMappings = {
    headToHead: 'Head-to-Head Result against opponent',
    frameDifference: 'Frame Difference (most frames won)',
    framesWon: 'Total Frames Won',
    highestBreak: 'Highest Break (Snooker)',
    wins: 'Match Wins',
    winPercentage: 'Win Percentage',
    totalPointsScored: 'Total Points Scored',
    totalPointsConceded: 'Total Points Conceded',
    random: 'Random Draw'
  };
  return ruleMappings[rule] || rule;
}
