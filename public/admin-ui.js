import { api, state, view, escapeHtml as e, heading, errorMessage, toast } from './core.js';

export async function adminView(parameter, isCurrent) {
  if (state.user.role !== 'admin') throw new Error('This space is for teacher/admin accounts.');
  const [quizzes, questions] = await Promise.all([api('/quizzes'), api('/admin/questions')]);
  if (!isCurrent()) return;
  view.innerHTML = `${heading('THE TEACHER’S DESK', 'Make room for good questions.', 'Shape the collections, refine an explanation, or bring a fresh set of questions.')}<div class="admin-tabs"><button class="button selected" id="questions-tab" aria-pressed="true">Question library <span>${questions.length}</span></button><button class="button" id="csv-tab" aria-pressed="false">Import CSV</button></div><section id="question-library"><div class="admin-toolbar"><label>Collection<select id="question-filter"><option value="all">All collections</option>${quizzes.map(q => `<option value="${q.id}">${e(q.title)}</option>`).join('')}</select></label><button class="button primary" id="add-question">Add a question +</button></div><p class="table-note">Each collection keeps at least ten questions. Add a replacement before moving or deleting one.</p><div class="table-wrap"><table><caption class="sr-only">Question library</caption><thead><tr><th>Question</th><th>Collection</th><th><span class="sr-only">Edit</span></th></tr></thead><tbody id="question-rows"></tbody></table></div></section><section id="csv-import" hidden><div class="import-card"><p class="eyebrow">A FEW QUESTIONS AT ONCE</p><h2>Bring your own curiosity.</h2><p>Use the standard template, choose an existing topic, and preview every row. Nothing is saved until you confirm the import.</p><a class="text-link" href="/question-template.csv" download>Download CSV template ↓</a><form id="csv-form"><label>CSV file <span class="muted">(up to 1 MB / 500 questions)</span><input type="file" name="file" id="csv-file" accept=".csv,text/csv" required></label><button class="button primary" type="submit">Preview questions →</button></form><div id="csv-error" role="alert"></div></div><div id="csv-preview"></div></section><dialog id="question-dialog" aria-labelledby="editor-title"><div class="dialog-header"><p class="eyebrow">A GOOD QUESTION GOES A LONG WAY</p><button class="icon-button" id="close-editor" type="button" aria-label="Close editor">×</button></div><h2 id="editor-title"></h2><form id="question-form"></form></dialog>`;
  const filter = document.querySelector('#question-filter');
  function rows() {
    const displayed = questions.filter(q => filter.value === 'all' || q.quiz_id === Number(filter.value));
    document.querySelector('#question-rows').innerHTML = displayed.map(q => `<tr><td class="question-cell">${e(q.question_text)}</td><td class="nowrap">${e(q.quiz_title)}</td><td><button class="button small" data-edit="${q.id}">Edit</button></td></tr>`).join('');
    view.querySelectorAll('[data-edit]').forEach(button => { button.onclick = () => edit(questions.find(q => q.id === Number(button.dataset.edit))); });
  }
  filter.onchange = rows; rows();
  const dialog = document.querySelector('#question-dialog');
  document.querySelector('#close-editor').onclick = () => dialog.close();
  document.querySelector('#add-question').onclick = () => edit();
  function edit(question) {
    document.querySelector('#editor-title').textContent = question ? 'A fresh perspective.' : 'Start with a question.';
    const form = document.querySelector('#question-form');
    form.innerHTML = `<label>Collection<select aria-label="Collection" name="quiz_id" required>${quizzes.map(q => `<option value="${q.id}" ${q.id === question?.quiz_id ? 'selected' : ''}>${e(q.title)}</option>`).join('')}</select></label><label>Question<textarea aria-label="Question" name="question_text" required maxlength="2000" rows="3">${e(question?.question_text || '')}</textarea></label><fieldset class="editor-choices"><legend>Four choices · select the correct answer</legend>${'ABCD'.split('').map((letter,index) => `<div class="editor-choice"><label class="correct-choice"><input type="radio" name="correct" value="${index}" required ${question?.choices[index]?.is_correct ? 'checked' : ''}><span class="sr-only">Correct answer </span>${letter}</label><label class="choice-input"><span class="sr-only">Choice ${letter}</span><input name="choice_${index}" required maxlength="500" value="${e(question?.choices[index]?.choice_text || '')}" placeholder="Answer choice ${letter}"></label></div>`).join('')}</fieldset><label>Explanation<textarea aria-label="Explanation" name="explanation" required maxlength="4000" rows="3">${e(question?.explanation || '')}</textarea></label><div id="editor-error" role="alert"></div><div class="editor-actions">${question ? '<button class="button danger" id="delete-question" type="button">Delete question</button>' : ''}<button class="button primary" type="submit">Save question →</button></div>`;
    form.onsubmit = async event => {
      event.preventDefault(); const values = Object.fromEntries(new FormData(form)); const submit = form.querySelector('[type=submit]'); submit.disabled = true;
      try {
        await api(`/admin/questions${question ? `/${question.id}` : ''}`, { method: question ? 'PUT' : 'POST', body: { quiz_id: Number(values.quiz_id), question_text: values.question_text, explanation: values.explanation,
          choices: [0,1,2,3].map(index => ({ choice_text: values[`choice_${index}`], is_correct: index === Number(values.correct) })) } });
        dialog.close(); toast('Question saved. A new possibility added.'); await adminView(parameter, isCurrent);
      } catch (error) { document.querySelector('#editor-error').innerHTML = errorMessage(error); submit.disabled = false; }
    };
    document.querySelector('#delete-question')?.addEventListener('click', async event => {
      if (!confirm('Delete this question? Completed results will be preserved.')) return;
      event.currentTarget.disabled = true;
      try { await api(`/admin/questions/${question.id}`, { method: 'DELETE', body: {} }); dialog.close(); toast('Question deleted.'); await adminView(parameter, isCurrent); }
      catch (error) { document.querySelector('#editor-error').innerHTML = errorMessage(error); const button = document.querySelector('#delete-question'); if (button) button.disabled = false; }
    });
    dialog.showModal();
  }
  function tab(importing) {
    document.querySelector('#question-library').hidden = importing; document.querySelector('#csv-import').hidden = !importing;
    for (const [name,selected] of [['questions-tab',!importing],['csv-tab',importing]]) {
      const button = document.getElementById(name); button.classList.toggle('selected',selected); button.setAttribute('aria-pressed',String(selected));
    }
  }
  document.querySelector('#questions-tab').onclick = () => tab(false);
  document.querySelector('#csv-tab').onclick = () => tab(true);
  document.querySelector('#csv-file').onchange = () => { document.querySelector('#csv-preview').innerHTML = ''; };
  document.querySelector('#csv-form').onsubmit = async event => {
    event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true;
    document.querySelector('#csv-error').innerHTML = ''; document.querySelector('#csv-preview').innerHTML = '';
    try {
      const preview = await api('/admin/upload-csv', { method: 'POST', body: new FormData(event.target) });
      if (!isCurrent()) return;
      document.querySelector('#csv-preview').innerHTML = `<div class="section-heading"><div><h2>Take a closer look.</h2></div><span class="collection-count">${preview.valid_count} valid · ${preview.error_count} invalid</span></div><div class="table-wrap"><table><caption class="sr-only">CSV preview and validation</caption><thead><tr><th>Line</th><th>Topic</th><th>Question & choices</th><th>Status</th></tr></thead><tbody>${preview.rows.map(row => `<tr class="${row.valid ? '' : 'invalid-row'}"><td>${row.row}</td><td>${e(row.topic)}</td><td>${e(row.question_text)}${row.valid ? `<details><summary>View choices & explanation</summary><ul>${row.choices.map(c => `<li>${c.choice_label}. ${e(c.choice_text)}${c.is_correct ? ' (correct)' : ''}</li>`).join('')}</ul><p>${e(row.explanation)}</p></details>` : ''}</td><td>${row.valid ? '<span class="table-badge">Valid</span>' : e(row.error)}</td></tr>`).join('')}</tbody></table></div><p class="table-note">Only valid rows will be imported. Invalid rows remain unchanged so you can correct and re-upload them.</p><button class="button primary" id="confirm-import" ${preview.valid_count ? '' : 'disabled'}>Import ${preview.valid_count} valid question${preview.valid_count === 1 ? '' : 's'} →</button><div id="import-result" role="status"></div>`;
      document.querySelector('#confirm-import').onclick = async click => {
        const confirmButton = click.currentTarget; confirmButton.disabled = true;
        try {
          const result = await api('/admin/upload-csv', { method: 'POST', body: { preview_token: preview.preview_token } });
          if (!isCurrent()) return;
          document.querySelector('#import-result').innerHTML = `<div class="notice">Imported ${result.imported_count} question${result.imported_count === 1 ? '' : 's'}. ${result.error_count} invalid row${result.error_count === 1 ? '' : 's'} skipped.</div>`;
          confirmButton.textContent = 'Import complete';
          const updated = await api('/admin/questions'); questions.splice(0,questions.length,...updated); rows();
          document.querySelector('#questions-tab').innerHTML = `Question library <span>${questions.length}</span>`;
        } catch (error) { document.querySelector('#import-result').innerHTML = errorMessage(error); confirmButton.disabled = false; }
      };
    } catch (error) { if (isCurrent()) document.querySelector('#csv-error').innerHTML = errorMessage(error); }
    finally { button.disabled = false; }
  };
}
