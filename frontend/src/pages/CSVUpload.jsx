import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

export default function CSVUpload() {
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [preview, setPreview] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(false);
  const [imported, setImported] = useState(null);
  const fileRef = useRef();

  const handleFileSelect = (e) => {
    const f = e.target.files[0];
    if (!f) return;

    setFile(f);
    setImported(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (rows.length === 0) {
          toast.error('File appears to be empty');
          return;
        }

        setHeaders(Object.keys(rows[0]));
        setPreview(rows.slice(0, 8));
        setTotalRows(rows.length);
      } catch {
        toast.error('Could not parse file. Make sure it is a valid CSV or Excel file.');
      }
    };
    reader.readAsBinaryString(f);
  };

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post('/leads/import-csv', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(data.message);
      setImported(data.count);
      setFile(null);
      setPreview([]);
      setHeaders([]);
      setTotalRows(0);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      toast.error(err.response?.data?.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setPreview([]);
    setHeaders([]);
    setTotalRows(0);
    setImported(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="max-w-3xl">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/leads" className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h2 className="page-title">Import Leads from CSV / Excel</h2>
      </div>

      {/* Success State */}
      {imported !== null && (
        <div className="mb-5 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-medium text-green-800">
              {imported} lead(s) imported successfully!
            </span>
          </div>
          <div className="flex gap-2">
            <Link to="/leads" className="btn-primary text-xs py-1.5">
              View Leads
            </Link>
            <button onClick={handleReset} className="btn-secondary text-xs py-1.5">
              Import More
            </button>
          </div>
        </div>
      )}

      {/* Upload Area */}
      <div className="card mb-4">
        <label
          htmlFor="fileInput"
          className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-10 cursor-pointer transition-colors ${
            file
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
          }`}
        >
          <svg className={`w-10 h-10 mb-3 ${file ? 'text-blue-500' : 'text-gray-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>

          {file ? (
            <>
              <p className="text-sm font-semibold text-blue-700">{file.name}</p>
              <p className="text-xs text-blue-500 mt-1">{totalRows} rows detected</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-600">Click to upload or drag & drop</p>
              <p className="text-xs text-gray-400 mt-1">CSV, XLS, XLSX — max 5 MB</p>
            </>
          )}
          <input
            ref={fileRef}
            id="fileInput"
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileSelect}
            className="hidden"
          />
        </label>

        {file && (
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleImport}
              disabled={loading}
              className="btn-primary"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Importing {totalRows} rows...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Import {totalRows} Lead{totalRows !== 1 ? 's' : ''}
                </>
              )}
            </button>
            <button onClick={handleReset} className="btn-secondary">
              Remove File
            </button>
          </div>
        )}
      </div>

      {/* Data Preview */}
      {preview.length > 0 && (
        <div className="card mb-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Data Preview
            <span className="font-normal text-gray-400 ml-2">(first {preview.length} of {totalRows} rows)</span>
          </h3>
          <div className="overflow-x-auto rounded border border-gray-100">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {headers.map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {preview.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    {headers.map((h) => (
                      <td key={h} className="px-3 py-2 text-gray-600 whitespace-nowrap max-w-xs truncate">
                        {String(row[h] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Format Guide */}
      <div className="card bg-gray-50 border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Expected CSV Format
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          The system auto-detects columns. Supported headers (case-insensitive):
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          {[
            { field: 'Name', required: true },
            { field: 'Phone', required: true },
            { field: 'Email', required: false },
            { field: 'Source', required: false },
            { field: 'Status', required: false },
          ].map(({ field, required }) => (
            <span
              key={field}
              className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                required ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'
              }`}
            >
              {field} {required && '*'}
            </span>
          ))}
        </div>

        <p className="text-xs font-semibold text-gray-500 mb-1">Sample CSV content:</p>
        <pre className="text-xs text-gray-600 bg-white border border-gray-200 rounded p-3 overflow-x-auto leading-5">
{`Name,Phone,Email,Source,Status
Suresh Patel,9876543210,suresh@example.com,YouTube,New
Meena Joshi,9812345678,meena@example.com,Google Ads,Contacted
Vikram Nair,9834567890,,Facebook,Interested
Sonal Gupta,9856789012,sonal@example.com,Referral,New`}
        </pre>

        <p className="text-xs text-gray-400 mt-2">
          Valid Sources: YouTube, Google Ads, Facebook, Instagram, Referral, Walk-in, Website, Other
          <br />
          Valid Statuses: New, Contacted, Interested, Not Interested, Closed
        </p>
      </div>
    </div>
  );
}
