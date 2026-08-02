import React from 'react';
import { Server, Key, CheckCircle2 } from 'lucide-react';

export const VpsGuideModal: React.FC = () => {
  return (
    <div className="space-y-8">
      
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl border border-emerald-800 space-y-4">
        <div className="inline-flex items-center gap-2 bg-emerald-800/60 text-emerald-300 text-xs px-3 py-1 rounded-full font-bold border border-emerald-700/60">
          <Server className="w-3.5 h-3.5" />
          <span>VPS Server Live Deployment Guide • Port 3002 & Central MySQL Database</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-white">
          VPS Server (Port 3002) & MySQL Database Live Deployment Guide
        </h2>
        <p className="text-emerald-200/90 text-sm max-w-3xl leading-relaxed">
          Step-by-step instructions for running the application on Port <strong>3002</strong> connected to a central <strong>MySQL Database</strong> for real-time synchronization across all browser counters and workstations.
        </p>
      </div>

      {/* System Roles Summary */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
          <Key className="w-5 h-5 text-emerald-600" />
          <span>System User Roles & Access Overview:</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-1">
            <span className="bg-emerald-700 text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
              1. System Admin
            </span>
            <p className="text-xs font-bold text-slate-900 mt-2">All Access Permissions</p>
            <p className="text-[11px] text-emerald-800 font-mono font-semibold">ID: admin | Pass: admin123</p>
            <p className="text-[11px] text-slate-500">Excel import, quotation builder, history, price catalog & user management.</p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-1">
            <span className="bg-blue-700 text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
              2. Doctor
            </span>
            <p className="text-xs font-bold text-slate-900 mt-2">Quotation Calculation & History</p>
            <p className="text-[11px] text-blue-800 font-mono font-semibold">ID: doctor | Pass: doctor123</p>
            <p className="text-[11px] text-slate-500">Patient search, treatment discount quotation & print invoice.</p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1">
            <span className="bg-amber-700 text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
              3. Call Center
            </span>
            <p className="text-xs font-bold text-slate-900 mt-2">Daily Appointment Sheet Import</p>
            <p className="text-[11px] text-amber-800 font-mono font-semibold">ID: callcenter | Pass: cc123</p>
            <p className="text-[11px] text-slate-500">Daily appointment Excel upload & new patient registration.</p>
          </div>
        </div>
      </div>

      {/* Deployment Steps Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Step 1: MySQL Setup */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black">
              1
            </div>
            <h3 className="font-bold text-slate-900 text-base">MySQL Database Setup & Schema Import</h3>
          </div>
          <p className="text-xs text-slate-600">
            Create MySQL database on your VPS server and import the <code className="text-emerald-700 font-bold">schema.sql</code> file:
          </p>
          <div className="bg-slate-900 text-emerald-400 p-3.5 rounded-xl text-xs font-mono overflow-x-auto space-y-1">
            <p># Connect to MySQL</p>
            <p className="text-slate-100">sudo mysql -u root -p</p>
            <p className="mt-2"># Execute inside MySQL prompt:</p>
            <p className="text-teal-300">CREATE DATABASE suoxi_hospital_db;</p>
            <p className="text-teal-300">CREATE USER 'suoxi_user'@'localhost' IDENTIFIED BY 'your_password';</p>
            <p className="text-teal-300">GRANT ALL PRIVILEGES ON suoxi_hospital_db.* TO 'suoxi_user'@'localhost';</p>
            <p className="text-teal-300">FLUSH PRIVILEGES; EXIT;</p>
            <p className="mt-2"># Import schema from project file</p>
            <p className="text-slate-100">mysql -u suoxi_user -p suoxi_hospital_db &lt; schema.sql</p>
          </div>
        </div>

        {/* Step 2: Environment Config (.env) */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center font-black">
              2
            </div>
            <h3 className="font-bold text-slate-900 text-base">Port 3002 & Database Environment (.env)</h3>
          </div>
          <p className="text-xs text-slate-600">
            Set port and MySQL configuration in the project root <code className="text-teal-700 font-bold">.env</code> file:
          </p>
          <div className="bg-slate-900 text-teal-300 p-3.5 rounded-xl text-xs font-mono overflow-x-auto space-y-1">
            <p>PORT=3002</p>
            <p>MYSQL_HOST=localhost</p>
            <p>MYSQL_PORT=3306</p>
            <p>MYSQL_USER=suoxi_user</p>
            <p>MYSQL_PASSWORD=your_password</p>
            <p>MYSQL_DATABASE=suoxi_hospital_db</p>
            <p>JWT_SECRET=generate_with_openssl_rand_hex_32</p>
          </div>
        </div>

        {/* Step 3: Build & PM2 Start */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-800 flex items-center justify-center font-black">
              3
            </div>
            <h3 className="font-bold text-slate-900 text-base">Production Build & PM2 Launch on Port 3002</h3>
          </div>
          <p className="text-xs text-slate-600">
            Build the application and run using PM2 process manager on port 3002:
          </p>
          <div className="bg-slate-900 text-indigo-300 p-3.5 rounded-xl text-xs font-mono overflow-x-auto space-y-1">
            <p># Install Dependencies & Build</p>
            <p className="text-slate-100">npm install</p>
            <p className="text-slate-100">npm run build</p>
            <p className="mt-2"># Start with PM2 on Port 3002</p>
            <p className="text-slate-100">pm2 start dist/server.cjs --name "suoxi-billing-3002"</p>
            <p className="text-slate-100">pm2 save && pm2 startup</p>
          </div>
        </div>

        {/* Step 4: Nginx Proxy to Port 3002 */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-black">
              4
            </div>
            <h3 className="font-bold text-slate-900 text-base">Nginx Reverse Proxy (Port 3002)</h3>
          </div>
          <p className="text-xs text-slate-600">
            Configure Nginx reverse proxy to forward requests to port 3002:
          </p>
          <div className="bg-slate-900 text-amber-300 p-3.5 rounded-xl text-xs font-mono overflow-x-auto space-y-1">
            <p className="text-slate-400"># /etc/nginx/sites-available/suoxi</p>
            <p className="text-slate-100">server &#123;</p>
            <p className="text-slate-100">    server_name billing.suoxihospital.com;</p>
            <p className="text-slate-100">    location / &#123;</p>
            <p className="text-slate-100">        proxy_pass http://localhost:3002;</p>
            <p className="text-slate-100">        proxy_set_header Host $host;</p>
            <p className="text-slate-100">    &#125;</p>
            <p className="text-slate-100">&#125;</p>
          </div>
        </div>

      </div>

      {/* Confirmation Card */}
      <div className="bg-emerald-50 rounded-2xl p-6 border border-emerald-200 flex items-start gap-3">
        <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="font-bold text-emerald-950 text-sm">Central Database & Multi-User Sync Guarantee</h4>
          <p className="text-xs text-emerald-800 leading-relaxed">
            All patient records and quotations are permanently saved in the central MySQL database, ensuring instant synchronization across all counter PCs and browser sessions.
          </p>
        </div>
      </div>

    </div>
  );
};
