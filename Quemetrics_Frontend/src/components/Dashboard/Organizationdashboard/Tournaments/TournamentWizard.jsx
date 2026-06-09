// DEPRECATED — this file is no longer used. Active wizard is TournamentCreationWizard.jsx
import React, { useState, useEffect, useContext } from 'react';
import { TournamentContext } from '../../../../contexts/TournamentContext';
import apiClient from '../../../../contexts/apiClient';
import { 
  FaTrophy, FaCalendarAlt, FaCheckCircle, FaExclamationCircle, 
  FaCog, FaUsers, FaArrowRight, FaArrowLeft, FaTimes, FaPlus 
} from 'react-icons/fa';

const TournamentWizard = ({ initialData, onComplete, onClose }) => {
  const { createTournament, updateTournament } = useContext(TournamentContext);
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 7;
  
  const [formData, setFormData] = useState({
    name: '',
    sport: 'Snooker',
    tier: 'local',
    format: 'knockout',
    startDate: '',
    endDate: '',
    venue: '',
    entryFee: 0,
    maxParticipants: 16,
    isDoubles: false,
    seedingType: 'random',
    byeType: 'random',
    drawType: 'full_bracket',
    tieBreakRule: 'respotted_black',
    status: 'upcoming',
    description: '',
    manualByes: [],
    manualOrder: [],
    standingsColumns: ['matchesPlayed', 'wins', 'losses']
  });

  const [clubs, setClubs] = useState([]);
  const [availableVenues, setAvailableVenues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (initialData) {
      setFormData(prev => ({ ...prev, ...initialData }));
    }
  }, [initialData]);

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, totalSteps));
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const result = initialData?.id 
        ? await updateTournament(initialData.id, formData)
        : await createTournament(formData);
      
      if (result.success) {
        onComplete(result.data);
      } else {
        setErrors({ submit: result.error });
      }
    } catch (err) {
      setErrors({ submit: 'Failed to save tournament' });
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <FaTrophy className="text-blue-600" /> Basic Information
            </h2>
            <div className="space-y-3 font-outfire">
              <div>
                <label className="block text-sm font-medium mb-1">Tournament Name</label>
                <input 
                  type="text" 
                  value={formData.name} 
                  onChange={(e) => updateField('name', e.target.value)}
                  className="w-full border rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. Amateur Snooker Open"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Sport</label>
                  <select 
                    value={formData.sport} 
                    onChange={(e) => updateField('sport', e.target.value)}
                    className="w-full border rounded-lg p-3 outline-none"
                  >
                    <option value="Snooker">Snooker</option>
                    <option value="Pool">Pool</option>
                    <option value="Pooker">Pooker</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Tier</label>
                  <select 
                    value={formData.tier} 
                    onChange={(e) => updateField('tier', e.target.value)}
                    className="w-full border rounded-lg p-3 outline-none"
                  >
                    <option value="local">Local</option>
                    <option value="county">County</option>
                    <option value="regional">Regional</option>
                    <option value="national">National</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <FaCalendarAlt className="text-blue-600" /> Schedule & Venue
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Start Date</label>
                <input 
                  type="date" 
                  value={formData.startDate} 
                  onChange={(e) => updateField('startDate', e.target.value)}
                  className="w-full border rounded-lg p-3 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">End Date</label>
                <input 
                  type="date" 
                  value={formData.endDate} 
                  onChange={(e) => updateField('endDate', e.target.value)}
                  className="w-full border rounded-lg p-3 outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Venue / Club</label>
              <input 
                type="text" 
                value={formData.venue} 
                onChange={(e) => updateField('venue', e.target.value)}
                className="w-full border rounded-lg p-3 outline-none"
                placeholder="Name of the hosting venue"
              />
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <FaUsers className="text-blue-600" /> Participation
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Max Participants</label>
                <input 
                  type="number" 
                  value={formData.maxParticipants} 
                  onChange={(e) => updateField('maxParticipants', parseInt(e.target.value))}
                  className="w-full border rounded-lg p-3 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Entry Fee</label>
                <input 
                  type="number" 
                  value={formData.entryFee} 
                  onChange={(e) => updateField('entryFee', parseFloat(e.target.value))}
                  className="w-full border rounded-lg p-3 outline-none"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-50 rounded">
              <input 
                type="checkbox" 
                checked={formData.isDoubles} 
                onChange={(e) => updateField('isDoubles', e.target.checked)} 
              />
              <span className="text-sm font-medium">Doubles Tournament</span>
            </label>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <FaCog className="text-blue-600" /> Structure & Format
            </h2>
            <div>
              <label className="block text-sm font-medium mb-1">Tournament Format</label>
              <select 
                value={formData.format} 
                onChange={(e) => updateField('format', e.target.value)}
                className="w-full border rounded-lg p-3 outline-none"
              >
                <option value="knockout">Straight Knockout</option>
                <option value="round_robin">Round Robin</option>
                <option value="group_knockout">Groups + Knockout</option>
              </select>
            </div>

            {formData.format === 'knockout' && (
              <div className="p-4 bg-gray-50 border rounded-xl space-y-4">
                <h3 className="font-medium text-sm">Advanced Knockout Rules</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Seeding</label>
                    <select 
                      value={formData.seedingType} 
                      onChange={(e) => updateField('seedingType', e.target.value)}
                      className="w-full border rounded-lg p-2 text-sm outline-none"
                    >
                      <option value="random">Random Seeding</option>
                      <option value="ranked">Ranked / Handicap Based</option>
                      <option value="manual">Manual Seeding</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Byes</label>
                    <select 
                      value={formData.byeType} 
                      onChange={(e) => updateField('byeType', e.target.value)}
                      className="w-full border rounded-lg p-2 text-sm outline-none"
                    >
                      <option value="random">Randomly Assigned</option>
                      <option value="seeded">Given to Top Seeds</option>
                      <option value="manual">Manually Assigned</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case 5:
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <FaCheckCircle className="text-blue-600" /> Match Rules & Tie-Breaks
            </h2>
            <div>
              <label className="block text-sm font-medium mb-1">Tie-Break Rule (No Draw)</label>
              <select 
                value={formData.tieBreakRule} 
                onChange={(e) => updateField('tieBreakRule', e.target.value)}
                className="w-full border rounded-lg p-3 outline-none"
              >
                <option value="respotted_black">Re-spotted Black</option>
                <option value="most_points">Most Points Scored (Total)</option>
                {(formData.sport || '').toLowerCase() === 'pooker' && <option value="black_ball_finish">Black Ball Finish</option>}
              </select>
              <p className="text-xs text-gray-500 mt-1">Used when frames are level to determine which player advances.</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Bracket Type</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    checked={formData.drawType === 'full_bracket'} 
                    onChange={() => updateField('drawType', 'full_bracket')} 
                  />
                  <span className="text-sm">Full Bracket (Fixed)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    checked={formData.drawType === 'round_by_round'} 
                    onChange={() => updateField('drawType', 'round_by_round')} 
                  />
                  <span className="text-sm">Redraw Every Round</span>
                </label>
              </div>
            </div>
          </div>
        );

      case 6:
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <FaExclamationCircle className="text-blue-600" /> Standings & Stats
            </h2>
            <p className="text-sm text-gray-600">Select which columns should be visible in the tournament standings/leaderboard.</p>
            <div className="grid grid-cols-2 gap-2 p-4 bg-gray-50 border rounded-xl">
              {[
                { key: 'matchesPlayed', label: 'Matches Played' },
                { key: 'wins', label: 'Wins' },
                { key: 'losses', label: 'Losses' },
                { key: 'framesWon', label: 'Frames Won' },
                { key: 'framesConceded', label: 'Frames Conceded' },
                { key: 'highestBreak', label: 'Highest Break' },
              ].map(col => (
                <label key={col.key} className="flex items-center gap-2 text-sm">
                  <input 
                    type="checkbox" 
                    checked={formData.standingsColumns.includes(col.key)} 
                    onChange={(e) => {
                      const current = formData.standingsColumns;
                      const next = e.target.checked ? [...current, col.key] : current.filter(k => k !== col.key);
                      updateField('standingsColumns', next);
                    }} 
                  />
                  {col.label}
                </label>
              ))}
            </div>

            {/* Game Specific Stats */}
            <div className="mt-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase mb-2">{(formData.sport || '').charAt(0).toUpperCase() + (formData.sport || '').slice(1).toLowerCase()} Stats</h3>
              <div className="grid grid-cols-2 gap-2">
                {(formData.sport || '').toLowerCase() === 'snooker' && (
                  <>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={formData.standingsColumns.includes('breaks50Plus')} onChange={(e) => updateField('standingsColumns', e.target.checked ? [...formData.standingsColumns, 'breaks50Plus'] : formData.standingsColumns.filter(k => k !== 'breaks50Plus'))} /> 50+ Breaks
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={formData.standingsColumns.includes('breaks100Plus')} onChange={(e) => updateField('standingsColumns', e.target.checked ? [...formData.standingsColumns, 'breaks100Plus'] : formData.standingsColumns.filter(k => k !== 'breaks100Plus'))} /> 100+ Breaks
                    </label>
                  </>
                )}
                {(formData.sport || '').toLowerCase() === 'pool' && (
                  <>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={formData.standingsColumns.includes('ballsPotted')} onChange={(e) => updateField('standingsColumns', e.target.checked ? [...formData.standingsColumns, 'ballsPotted'] : formData.standingsColumns.filter(k => k !== 'ballsPotted'))} /> Balls Potted
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={formData.standingsColumns.includes('sevenBallWins')} onChange={(e) => updateField('standingsColumns', e.target.checked ? [...formData.standingsColumns, 'sevenBallWins'] : formData.standingsColumns.filter(k => k !== 'sevenBallWins'))} /> 7-Ball Wins
                    </label>
                  </>
                )}
                {(formData.sport || '').toLowerCase() === 'pooker' && (
                  <>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={formData.standingsColumns.includes('blackFinishes')} onChange={(e) => updateField('standingsColumns', e.target.checked ? [...formData.standingsColumns, 'blackFinishes'] : formData.standingsColumns.filter(k => k !== 'blackFinishes'))} /> Black Finishes
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={formData.standingsColumns.includes('whitewashWins')} onChange={(e) => updateField('standingsColumns', e.target.checked ? [...formData.standingsColumns, 'whitewashWins'] : formData.standingsColumns.filter(k => k !== 'whitewashWins'))} /> Whitewash Wins
                    </label>
                  </>
                )}
              </div>
            </div>
          </div>
        );

      case 7:
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <FaCheckCircle className="text-green-600" /> Review & Create
            </h2>
            <div className="bg-gray-50 p-4 border rounded-xl text-sm space-y-2">
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500">Name</span>
                <span className="font-medium">{formData.name}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500">Sport</span>
                <span className="font-medium uppercase">{formData.sport}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500">Format</span>
                <span className="font-medium uppercase">{formData.format}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500">Max Players</span>
                <span className="font-medium">{formData.maxParticipants}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-500">Start Date</span>
                <span className="font-medium">{formData.startDate}</span>
              </div>
            </div>
            <p className="text-sm text-gray-500">By clicking "Create Tournament", you will publish this tournament to the platform.</p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 font-outfire">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b flex justify-between items-center bg-gray-50">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tournament Wizard</h1>
            <p className="text-sm text-gray-500">Step {currentStep} of {totalSteps}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition">
            <FaTimes className="text-gray-500" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="h-1.5 w-full bg-gray-200">
          <div 
            className="h-full bg-blue-600 transition-all duration-300" 
            style={{ width: `${(currentStep / totalSteps) * 100}%` }}
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {errors.submit && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-3">
              <FaExclamationCircle /> {errors.submit}
            </div>
          )}
          {renderStep()}
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-gray-50 flex justify-between items-center">
          <button 
            onClick={prevStep} 
            disabled={currentStep === 1}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium transition ${
              currentStep === 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-200'
            }`}
          >
            <FaArrowLeft /> Back
          </button>
          
          <div className="flex gap-3">
            {currentStep < totalSteps ? (
              <button 
                onClick={nextStep}
                disabled={currentStep === 1 && !formData.name}
                className="flex items-center gap-2 px-8 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition disabled:opacity-50 shadow-lg shadow-blue-200"
              >
                Next <FaArrowRight />
              </button>
            ) : (
              <button 
                onClick={handleSubmit}
                disabled={loading}
                className="flex items-center gap-2 px-10 py-2.5 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition shadow-lg shadow-green-200"
              >
                {loading ? 'Processing...' : 'Create Tournament'} <FaCheckCircle />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TournamentWizard;
