$(document).ready(function() {

    var curpage = 0;
    var backupId = 0;
    var dirSep = '/';
    var pathSep = ':';
    var treeels = { };
    var searchTree = null;
    var searchIncludes = {};
    var searchdata = {};

    var performRestore = function(tasks) {
        var dlg = $('<div></div>').attr('title', 'Restoring files ...');
        dlg.dialog({
            autoOpen: true,
            modal: true,
            closeOnEscape: false
        });

        dlg.parent().find('.ui-dialog-titlebar-close').remove().first().remove();

        var pg = $('<div></div>');
        pg.progressbar({ value: false });
        var pgtxt = $('<div></div>');
        pgtxt.text('Sending jobs to server ...');

        dlg.append(pg);
        dlg.append(pgtxt);

        var onAllRestoresCompleted = function() {
            $(document).off('server-progress-updated', serverProgressUpdateMethod);
            $(document).off('server-state-updated', serverStateUpdateMethod);

            curpage = Math.min(2, curpage+1);
            updatePageNav();
            dlg.dialog('close');
            dlg.remove();
        };

        var currentProgressTask = null;
        var remainingTasks = tasks.length;

        var serverProgressUpdateMethod = function(e, data) {
            if (currentProgressTask == null)
                pgtxt.text('Waiting for restore to begin ...');
            else {
                if (tasks.length == 1)
                    pgtxt.text('Restoring files ...');
                else
                    pgtxt.text('Restoring files (' + (tasks.length - remainingTasks) + ' of ' + tasks.length + ')');
            }

        };

        var serverStateUpdateMethod = function(e, data) {
            var activeTaskId = -1;
            var queuedTasks = [];

            if (data.ActiveTask != null)
                activeTaskId = data.ActiveTask.Item1;

            if (data.SchedulerQueueIds != null)
                for(var n in data.SchedulerQueueIds)
                    queuedTasks.push(data.SchedulerQueueIds[n].Item1);

            var remaining = 0;
            for(var n in tasks) {

                if (tasks[n].taskId == activeTaskId) {
                    currentProgressTask = tasks[n];
                    remaining++;
                    continue;
                }

                for(var i in queuedTasks)
                    if (queuedTasks[i] == tasks[n].taskId) {
                        remaining++;
                        continue;
                    }
            }

            if (remaining == 0)
                onAllRestoresCompleted();
        };

        var curTask = 0;
        var registerTasks = function() {
            if (curTask == tasks.length) {
                pgtxt.text('Waiting for restore to begin ...');
                $(document).on('server-progress-updated', serverProgressUpdateMethod);
                $(document).on('server-state-updated', serverStateUpdateMethod);
                return;
            }

            var task = tasks[curTask];
            task['action'] = 'restore-files';
            task['HTTP_METHOD'] = 'POST';
            curTask++;

            APP_DATA.callServer(task, function(data) {
                task['taskId'] = data.TaskID;
                registerTasks();
            },
            function(d, s, m) {
                alert('Error: ' + m);
                dlg.dialog('close');
                dlg.remove();
            });

        }

        registerTasks();
    };

    $('#restore-dialog').dialog({
        minWidth: 320, 
        width: $('body').width > 600 ? 320 : 600, 
        minHeight: 480, 
        height: 500, 
        modal: true,
        autoOpen: false,
        closeOnEscape: true,
        buttons: [
            { text: '< Previous', disabled: true, click: function(event, ui) {
                curpage = Math.max(0, curpage-1);
                updatePageNav();

            }},
            { text: 'Next >', click: function(event, ui) {
                if (curpage == 2) {
                     $('#restore-dialog').dialog('close');
                } else if (curpage == 1) {

                    var restorePath = null;

                    var overwrite = $('#restore-overwrite-overwrite').is(':checked');

                    if ($('#restore-overwrite-target-other').is(':checked'))
                        restorePath = $('#restore-target-path').val();

                    var includes = buildIncludeMap();

                    var tasks = [];
                    for(var n in includes) {
                        var t = {
                            time: n,
                            id: backupId,
                            'restore-path': restorePath,
                            'overwrite': overwrite,
                            paths: []
                        }
                        for(var p in includes[n]) {
                            if (p.lastIndexOf(dirSep) == p.length -1)
                                t.paths.push(p + '*');
                            else
                                t.paths.push(p);
                        }

                        if (t.paths.length > 0)
                        {
                            t.paths = t.paths.join(pathSep);
                            tasks.push(t);
                        }
                    }

                    performRestore(tasks);
                } else {
                    var els = 0;
                    var includes = buildIncludeMap();

                    for(var t in includes)
                        for(var i in includes[t])
                            els++;

                    if (els == 0) {
                        alert('You must select at least one path to restore');
                        return;
                    }

                    curpage = Math.min(2, curpage+1);
                    updatePageNav();

                }
            }}
        ]        
    });

    var dlg_buttons = $('#restore-dialog').parent().find('.ui-dialog-buttonpane').find('.ui-button');
    var updatePageNav = function() {
        if (curpage == 0) {
            $('#restore-files-page').show();
            $('#restore-path-page').hide();
            $('#restore-complete-page').hide();
            dlg_buttons.first().show();
            dlg_buttons.last().button('option', 'label', 'Next >');
        } else if (curpage == 1) {
            $('#restore-files-page').hide();
            $('#restore-path-page').show();
            $('#restore-complete-page').hide();
            dlg_buttons.first().show();
            dlg_buttons.last().button('option', 'label', 'Restore');
        } else {
            $('#restore-files-page').hide();
            $('#restore-path-page').hide();
            $('#restore-complete-page').show();

            dlg_buttons.first().hide();
            dlg_buttons.last().button('option', 'label', 'OK');
        }

        dlg_buttons.first().button('option', 'disabled', curpage == 0);
    };

    $('#restore-search').watermark('Search for files & folders');

    $('#restore-files-page').show();
    $('#restore-path-page').hide();
    $('#restore-complete-page').hide();

    var colorize = function(tree, term) {
        $(tree).find('a.jstree-anchor').each(function(i, e) {
            var s = $(e);
            var o = s.children();
            if (!s.first().hasClass('jstree-disabled')) {
                o.find('div.search-match').remove();
                o = s.children();
                s.html(replace_insensitive(s.text(), term, '<div class="search-match">$1</div>'));
                s.prepend(o);
            }
        });
    };

    var highlightCurrentTimes = function(e) {
        if (searchTree == null)
            return;

        var tr = searchTree.jstree();
        var time = $('#restore-version').val();

        var nodes = (e || searchTree).find('.icon-clock').closest('li').parent();
        nodes.each(function(i, e) {
            var times = $(e).find('.icon-clock').closest('li');
            var found = false;
            times.each(function(i, e) {
                var node = tr.get_node(e);
                var a = $(e).find('a');
                if (node.original.time == time) {
                    a.addClass('restore-current-time');
                    found = true;
                } else {
                    a.removeClass('restore-current-time ');
                }
            });
        });

    }


    var inSearch = false;
    var doSearch = function(search) {

        if (inSearch)
            return;

        inSearch = true;
        if (searchTree != null) {
            searchTree.remove();
            searchTree = null;
        }

        for(var t in treeels)
            treeels[t].hide();

        var processData = function (callback, data) {

            var roots = [];

            var createNode = function(disp, path, isFolder) {
                return {
                    text: disp,
                    children: [],
                    filepath: path, 
                    isFolder: isFolder,
                    state: { opened: true }
                };
            };

            var appendNode = function(path, sizes) {
                var isFolder = path.lastIndexOf(dirSep) == path.length - 1;
                var parts = path.split(dirSep);
                var cur = roots;
                var rebuilt = '';
                var lastEntry = null;

                for(var i in parts) {
                    var found = false;
                    if (parts[i] == '')
                        continue;

                    rebuilt += '/' + parts[i];

                    for(var j in cur) {
                        if (cur[j].text == parts[i]) {
                            found = true;
                            cur = cur[j].children;
                        }
                    }

                    if (!found) {
                        lastEntry = createNode(parts[i], rebuilt, true);
                        cur.push(lastEntry);
                        cur = lastEntry.children;
                    }
                }

                if (!isFolder && lastEntry != null) {
                    lastEntry.isFolder = false;
                    lastEntry.state.opened = false;
                    lastEntry.icon = 'icon-file icon-file-' + lastEntry.text.substr(lastEntry.text.lastIndexOf('.')+1);
                    for(var x in data.Filesets)
                        if (sizes[x] != -1) {
                            cur.push({
                                isTime: true,
                                time: data.Filesets[x].Time,
                                filepath: lastEntry.filepath,
                                text: $.timeago(data.Filesets[x].Time) + ' (' + $.formatSizeString(sizes[x]) + ')',
                                icon: 'icon-clock',
                                state: { disabled: true }
                            });
                        }
                }
            };

            for(var n in data.Files)
                appendNode(data.Files[n].Path, data.Files[n].Sizes);

            var packNodes = function() {
                for(var rx in roots) {
                    var r = roots[rx];
                    
                    while(r.children.length == 1 && r.children[0].isFolder) {
                        var c = r.children[0];
                        r.text = r.text + dirSep + c.text;
                        r.filepath = r.text;
                        r.children = c.children;
                    }

                    if (dirSep == '/' && !r.text.substr(0, 1) != dirSep)
                        r.text = dirSep + r.text;
                }
            };

            packNodes();

            callback(roots);
            colorize(searchTree, search);
            highlightCurrentTimes();

            searchTree.on('open_node.jstree', function(e, data) {

                var node = searchTree.find('#' + data.node.id);
                var icons = node.find('.icon-clock').closest('ul');

                // Remove checkboxes from time entries
                icons.addClass('jstree-no-checkboxes');

                // Make the row un-selectable
                icons.find('div.jstree-wholerow').remove();

                highlightCurrentTimes(node);
                colorize(node, search);
            });

            inSearch = false;
        }

        var loadData = function(callback) {
            for(var k in searchdata)
                if (search.indexOf(k) == 0) {
                    var els = [];
                    for(var n in searchdata[k].Files)
                        if (searchdata[k].Files[n].Path.toLowerCase().indexOf(search.toLowerCase()) >= 0)
                            els.push(searchdata[k].Files[n]);

                    processData(callback, {Files: els, Filesets: searchdata[k].Filesets});
                    return;
                }

            APP_DATA.callServer({
                    action: 'search-backup-files',
                    id: backupId,
                    filter: '*' + search + '*',
                    'all-versions': true
                },
                function(data) {
                    processData(callback, data);
                    searchdata[search] = data;
                },
                function(data, success, message) {
                    alert('Search failed: ' + message);
                    inSearch = false;
                }
            );
        }

        searchTree = $('<div></div>');
        $('#restore-files-tree').append(searchTree);
        searchTree.jstree({
            'plugins' : [ 'wholerow', 'checkbox' ],
            'core': {
                'data': function(node, callback) {
                    if (node.id === '#')
                        loadData(callback);
                }
            }
        });

    };

    var loadNodes = function(node, callback, time) {
        $.ajax({
            'url': APP_CONFIG.server_url,
            'data': {
                'action': 'search-backup-files',
                'id': backupId,
                'time': time,
                'prefix-only': node.id === '#',
                'filter': node.id === '#' ? '*' : '[' + node.original.filepath + '[^\\' + dirSep + ']+\\' + dirSep + '?]',
                'Prefix': node.id === '#' ? '' : node.original.filepath
            },
            'dataType': 'json'
        })
        .done(function(data, status, xhr) {
            var nodes = [];
            data.Files = data.Files || [];
            for(var i = 0; i < data.Files.length; i++) {
                var o = data.Files[i];
                var disp = o.Path.substr(data.Prefix.length);
                var isFolder = disp.lastIndexOf(dirSep) == disp.length - 1;
                var icon = null;
                var state = null;
                if (isFolder)
                    disp = disp.substr(0, disp.length - 1);
                else
                    icon = 'icon-file icon-file-' + disp.substr(disp.lastIndexOf('.')+1);

                if (data.Prefix == '') {
                    disp = APP_DATA.getBackupName(backupId) || disp;
                    //state = {opened: true};
                }

                nodes.push({
                    text: disp,
                    filepath: o.Path,
                    time: time,
                    children: isFolder,
                    state: state,
                    icon: icon
                });
            }

            callback(nodes, data);
        });
    };

    var setupFullTree = function(time) {

        var treeel = treeels[time];

        if (!treeels[time]) {
            var treeel = $('<div></div>');
            treeels[time] = treeel;
            $('#restore-files-tree').append(treeel);

            treeel.jstree({
                'core': {
                    'data': function(node, callback) { 
                        loadNodes(node, function(nodes, data) { 
                            callback(nodes);
                            if (data.Prefix == '')
                                treeel.jstree("open_node", treeel.find('li').first());
                        }, 
                        time); 
                    }
                },
                'plugins' : [ 'wholerow', "checkbox" ]
            });

            treeel.on('deselect_node.jstree', function(e, data) {
                var path = treeel.jstree().get_node(data.node).original.filepath;
                if (searchIncludes[time])
                    for (var f in searchIncludes[time])
                        if (f.indexOf(path) == 0)
                            delete searchIncludes[time][f];
            });
        }

        for(var t in treeels)
            if (t != time)
                treeels[t].hide();
            else {
                treeels[t].show();
            }

        if (searchTree != null)
            searchTree.hide();

    };

    var buildIncludeMap = function() {
        var m = {};

        for(var t in treeels) {
            m[t] = {};
            var tr = treeels[t].jstree();

            treeels[t].find('.jstree-clicked').each(function(i, e) {
                var p = tr.get_node(e).original.filepath;
                if (p)
                    m[t][p] = 1;
            });
        }

        for(var t in searchIncludes) {
            if (!m[t])
                m[t] = {};

            for (var f in searchIncludes[t])
                m[t][f] = 1;
        }
    };

    $('#restore-dialog').on('setup-data', function(e, id) {
        backupId = id;
        treeels = { };
        searchIncludes = { };
        searchTree = null;
        searchdata = { };
        $('#restore-files-tree').empty();
        $('#restore-form').each(function(i, e) { e.reset(); });
        $('#restore-overwrite-overwrite').each(function(i, e) { e.checked = true; });
        $('#restore-overwrite-target-original').each(function(i, e) { e.checked = true; });


        curpage = 0; 
        updatePageNav();    


        APP_DATA.getServerConfig(function(serverdata) {

            dirSep = serverdata.DirectorySeparator;
            pathSep = serverdata.PathSeparator;

            APP_DATA.callServer({ 'action': 'list-backup-sets', id: id }, function(data, success, message) {
                    $('#restore-version').empty();

                    if (data == null || data.length == 0) {
                        alert('Failed to get list of backup times');
                        $('#restore-dialog').dialog('close');
                    }

                    $('#restore-version').append($("<option></option>").attr("value", data[0].Time).text('Latest - ' + $.timeago(data[0].Time)));
                    for(var i in data)
                        if (i != '0')
                            $('#restore-version').append($("<option></option>").attr("value", data[i].Time).text($.timeago(data[i].Time)));

                    $('#restore-version').trigger('change');

                }, function(data, success, message) {
                    alert('Failed to get list of backup times:\n' + message);
                    $('#restore-dialog').dialog('close');
                });
        }, function() {
            alert('Failed to get server config');
            $('#restore-dialog').dialog('close');
        });
    });

    var doQuickSearch = function(search) {
        if (searchTree != null && searchTree.css('display') == 'block') {
            var search = $('#restore-search').val();
            for(var k in searchdata) {
                if (search.indexOf(k) == 0) {
                    doSearch(search);
                    return true;
                }
            }
        }

        return false;
    };

    $('#restore-search').keypress(function(e) {
        if (e.which == 13 && $('#restore-search').val().trim() != '')
            doSearch($('#restore-search').val());
        else
            doQuickSearch($('#restore-search').val());
    });

    $('#restore-search').keydown(function(e) {
        doQuickSearch($('#restore-search').val());
    });

    $('#restore-search').change(function(e) {
        if ($('#restore-search').val() == '')
            $('#restore-version').trigger('change');
    });

    $('#restore-search').on('search', function(e) {
        if ($('#restore-search').val() == '')
            $('#restore-version').trigger('change');
        else
            doSearch($('#restore-search').val());
    });

    $('#restore-version').change(function() {
        $('#restore-search').val('');
        setupFullTree($('#restore-version').val());
    });
    
    $('#restore-target-path').keypress(function() { $('#restore-overwrite-target-other').each(function(i,e) { e.checked = true; }); });
    $('#restore-target-path').change(function() { $('#restore-overwrite-target-other').each(function(i,e) { e.checked = true; }); });

    $('#restore-overwrite-target-other').click(function() { $('#restore-target-path-browse').trigger('click'); } );

    $('#restore-target-path-browse').click(function(e) {
        $.browseForFolder({
            title: 'Select restore folder',
            resolvePath: true,
            callback: function(path, display) {
                $('#restore-target-path').val(path);
                $('#restore-overwrite-target-other').each(function(i, e) { e.checked = true; });
            }
        });
    });

   
});