GLClient.controller('SubmissionCtrl',
    ['$scope', 'Utils', '$filter', '$location', '$interval', '$uibModal', '$anchorScroll', 'tmhDynamicLocale', 'Submission', 'glbcProofOfWork', 'fieldUtilities',
      function ($scope, Utils, $filter, $location, $interval, $uibModal, $anchorScroll, tmhDynamicLocale, Submission, glbcProofOfWork, fieldUtilities) {

  $scope.fieldUtilities = fieldUtilities;
  $scope.context_id = $location.search().context || undefined;
  $scope.receivers_ids = $location.search().receivers || [];

  $scope.problemToBeSolved = false;
  $scope.problemModal = undefined;

  $scope.total_score = 0;

  $scope.problemSolved = function() {
    $scope.problemModal = undefined;
    $scope.submission._token.$update(function(token) {
      $scope.submission._token = token;
      $scope.problemToBeSolved = $scope.submission._token.human_captcha !== false;
      if ($scope.problemToBeSolved) {
        $scope.openProblemDialog($scope.submission);
      }
    });
  };

  $scope.openProblemDialog = function(submission){
    if ($scope.problemModal) {
      $scope.problemModal.dismiss();
    }

    var args = {
      submission: submission,
      problemSolved: $scope.problemSolved
    };

    $scope.problemModal = $scope.Utils.openConfirmableModalDialog('views/partials/captchas.html', args);

    $scope.problemModal.result.then(
      function() { $scope.problemSolved($scope.submission); },
      function() { }
    );
  };

  $scope.selected_context = undefined;

  $scope.selectContext = function(context) {
    $scope.selected_context = context;
  };

  if ($scope.receivers_ids) {
    try {
      $scope.receivers_ids = angular.fromJson($scope.receivers_ids);
    }
    catch(err) {
      $scope.receivers_ids = [];
    }
  }

  if ($scope.node.show_contexts_in_alphabetical_order) {
    $scope.contextsOrderPredicate = 'name';
  } else {
    $scope.contextsOrderPredicate = 'presentation_order';
  }

  $scope.selectable_contexts = $filter('filter')($scope.contexts, {'show_context': true});
  $scope.selectable_contexts = $filter('orderBy')($scope.selectable_contexts, $scope.contextsOrderPredicate);

  var startCountdown = function() {
    $scope.submission.wait = true;
    $scope.submission.pow = false;

    $scope.submission.countdown = 10; // aligned to backend submission_minimum_delay

    $scope.stop = $interval(function() {
      $scope.submission.countdown -= 1;
      if ($scope.submission.countdown < 0) {
        $scope.submission.wait = false;
        $interval.cancel($scope.stop);
      }
    }, 1000);
  };

  $scope.selectable = function () {
    if ($scope.submission.context.maximum_selectable_receivers === 0) {
      return true;
    }

    return $scope.submission.count_selected_receivers() < $scope.submission.context.maximum_selectable_receivers;
  };

  $scope.switch_selection = function (receiver) {
    if (receiver.configuration !== 'default' || (!$scope.node.allow_unencrypted && receiver.pgp_key_public === '')) {
      return;
    }

    if ($scope.submission.receivers_selected[receiver.id] || $scope.selectable()) {
      $scope.submission.receivers_selected[receiver.id] = !$scope.submission.receivers_selected[receiver.id];
    }
  };

  $scope.getCurrentStepIndex = function() {
    return $scope.selection;
  };

  $scope.getCurrentStep = function() {
    return $scope.submission.context.questionnaire.steps[$scope.selection];
  };

  $scope.goToStep = function(index, activateErrPanel) {
    $scope.selection = index;
    if (angular.isDefined(activateErrPanel)) {
      $scope.getCurrentStep().errPanelActive = true;
    }
    if (index === $scope.receiver_selection_step_index) {
      $scope.receiver_selection_step_show_err_panel = true;
    }
    $anchorScroll('top');
  };

  $scope.firstStepIndex = function() {
    return $scope.receiver_selection_step ? -1 : 0;
  };

  $scope.lastStepIndex = function() {
    var last_enabled = 0;

    for (var i = 0; i < $scope.selected_context.questionnaire.steps.length; i++) {
      if (fieldUtilities.isStepTriggered($scope.selected_context.questionnaire.steps[i], $scope.answers, $scope.total_score)) {
        last_enabled = i;
      }
    }

    return last_enabled;
  };

  $scope.hasNextStep = function() {
    if ($scope.selected_context === undefined) {
      return false;
    }

    return $scope.selection < $scope.lastStepIndex();
  };

  $scope.hasPreviousStep = function() {
    if ($scope.selected_context === undefined) {
      return false;
    }

    return $scope.selection > $scope.firstStepIndex();
  };

  $scope.checkForInvalidFields = function() {
    // find the first invalid element
    var form = document.getElementById('step-' + $scope.selection);
    var firstInvalid = form.querySelector('.inputelem.ng-invalid');

    // if we find one, set focus
    if (firstInvalid) {
      $scope.getCurrentStep().errPanelActive = true;
      $anchorScroll('top');
      return false;
    }

    return true;
  };

  $scope.displaySubmissionErrors = function(submissionForm) {
    var t = angular.isDefined(submissionForm) &&
            submissionForm.$dirty &&
            $scope.submissionHasErrors(submissionForm) &&
            !$scope.hasNextStep();
    if (angular.isDefined($scope.submission)) {
      // Prevents the flash of error panel after submission btn is clicked
      t = t && !$scope.submission.done;
      // Prevents the display of errors before a user can possibly submit
      t = t && !$scope.submission.wait;
    }
    return t;
  };

  $scope.incrementStep = function(submissionForm) {
    if ($scope.selection === $scope.receiver_selection_step_index && $scope.receiverSelectionError()) {
      $scope.receiver_selection_step_show_err_panel = true;
      $anchorScroll('top');
      return;
    }

    if ($scope.selection >=0 &&
        $scope.submission.context.questionnaire.steps_navigation_requires_completion &&
        !$scope.checkForInvalidFields()) {
      return;
    }

    if ($scope.hasNextStep()) {
      submissionForm.$dirty = false;
      for (var i = $scope.selection + 1; i <= $scope.lastStepIndex(); i++) {
        if (fieldUtilities.isStepTriggered($scope.submission.context.questionnaire.steps[i], $scope.answers, $scope.total_score)) {
          $scope.selection = i;
          $anchorScroll('top');
          break;
        }
      }
    }
  };

  $scope.decrementStep = function(submissionForm) {
    if ($scope.hasPreviousStep()) {
      submissionForm.$dirty = false;
      for (var i = $scope.selection - 1; i >= $scope.firstStepIndex(); i--) {
        if (i === -1 || fieldUtilities.isStepTriggered($scope.submission.context.questionnaire.steps[i], $scope.answers, $scope.total_score)) {
          $scope.selection = i;
          $anchorScroll('top');
          break;
        }
      }
    }
  };

  $scope.fileupload_url = function() {
    if (!$scope.submission) {
      return;
    }

    return 'submission/' + $scope.submission._token.id + '/file';
  };

  $scope.calculateScoreRecursively = function(field, entry) {
    var score = 0;
    var i;

    if (['selectbox', 'multichoice'].indexOf(field.type) !== -1) {
      for(i=0; i<field.options.length; i++) {
        if (entry['value'] === field.options[i].id) {
          score += field.options[i].score_points;
        }
      }
    }

    if (field.type === 'checkbox') {
      for(i=0; i<field.options.length; i++) {
        if (entry[field.options[i].id] === true) {
          score += field.options[i].score_points;
        }
      }
    }

    angular.forEach(field.children, function(child) {
      angular.forEach(entry[child.id], function(entry) {
        score += $scope.calculateScoreRecursively(child, entry);
      });
    });

    return score;
  };

  $scope.calculateScore = function() {
    if (!$scope.node.enable_experimental_features) {
      return 0;
    }

    var score = 0;

    angular.forEach($scope.submission.context.questionnaire.steps, function(step) {
      angular.forEach(step.children, function(field) {
        angular.forEach($scope.answers[field.id], function(entry) {
          score += $scope.calculateScoreRecursively(field, entry);
        });
      });
    });

    return score;
  };

  $scope.prepareSubmission = function(context, receivers_ids) {
    $scope.answers = {};
    $scope.uploads = {};

    // iterations over steps require the steps array to be ordered
    context.questionnaire.steps = $filter('orderBy')(context.questionnaire.steps, 'presentation_order');

    angular.forEach(context.questionnaire.steps, function(step) {
      angular.forEach(step.children, function(field) {
        $scope.answers[field.id] = [angular.copy(fieldUtilities.prepare_field_answers_structure(field))];
      });
    });

    $scope.$watch('answers', function() {
      $scope.total_score = $scope.calculateScore();
      $scope.submission._submission.total_score = $scope.total_score;
    }, true);

    $scope.submission.create(context.id, receivers_ids, function () {
      startCountdown();

      $scope.problemToBeSolved = $scope.submission._token.human_captcha !== false;

      if ($scope.node.enable_proof_of_work) {
        glbcProofOfWork.proofOfWork($scope.submission._token.proof_of_work).then(function(result) {
          $scope.submission._token.proof_of_work_answer = result;
          $scope.submission._token.$update(function(token) {
            $scope.submission._token = token;
            $scope.submission.pow = true;
          });
        });
      } else {
        $scope.submission.pow = true;
      }

      if ($scope.problemToBeSolved) {
        $scope.openProblemDialog($scope.submission);
      }

      if ($scope.submission.context.show_receivers_in_alphabetical_order) {
        $scope.receiversOrderPredicate = 'name';
      } else {
        $scope.receiversOrderPredicate = 'presentation_order';
      }

      // --------------------------------------------------------------------------
      // fix steps numbering adding receiver selection step if neeeded
      $scope.receiver_selection_step = false;
      $scope.receiver_selection_step_index = -1;
      $scope.selection = 0;

      if ($scope.submission.context.allow_recipients_selection) {
        $scope.receiver_selection_step = true;
        $scope.selection = -1;
        $scope.receiver_selection_step_show_err_panel = false;
      }

      $scope.show_steps_navigation_bar = ($scope.submission.context.questionnaire.show_steps_navigation_bar &&
                                          ($scope.receiver_selection_step || $scope.submission.context.questionnaire.steps.length > 1));
    });
  };

  $scope.completeSubmission = function() {
    $scope.submission._submission.answers = $scope.answers;
    $scope.submission.submit();
  };

  new Submission(function(submission) {
    $scope.submission = submission;

    var context = null;

    if ($scope.context_id) {
      context = $filter('filter')($scope.contexts,
                                  {"id": $scope.context_id})[0];
    } else if ($scope.selectable_contexts.length === 1) {
      context = $scope.selectable_contexts[0];
    }

    if (context) {
      $scope.selected_context = context;

      $scope.field_id_map = fieldUtilities.build_field_id_map(context);
    }

    // Watch for changes in certain variables
    $scope.$watch('selected_context', function () {
      if ($scope.submission && $scope.selected_context) {
        $scope.prepareSubmission($scope.selected_context, $scope.receivers_ids);
      }
    });

    $scope.submissionHasErrors = function(submissionForm) {
      if (angular.isDefined(submissionForm)) {
        return submission.isDisabled() ||
               submissionForm.$invalid ||
               Utils.isUploading($scope.uploads);
      }
      return false;
    };

    $scope.receiverSelectionError = function() {
      for (var rec_id in submission.receivers_selected) {
        if (submission.receivers_selected[rec_id]) {
          return false;
        }
      }
      return true;
    };

  });
}]).
controller('SubmissionStepCtrl', ['$scope', '$filter', 'fieldUtilities',
  function($scope, $filter, fieldUtilities) {
  $scope.fields = $scope.step.children;
  $scope.step.errPanelActive = false;

  var stepFormVarName = fieldUtilities.stepFormName($scope.step.id);
  $scope.stepFormVarName = stepFormVarName;

  $scope.stepHasErrors = function(submissionForm) {
    var sf_ref = submissionForm[stepFormVarName];
    if (angular.isDefined(sf_ref) && $scope.step.errPanelActive) {
      return sf_ref.$invalid;
    }
    return false;
  };

  $scope.rows = fieldUtilities.splitRows($scope.fields);

  $scope.status = {
    opened: false,
  };
}]).
controller('SubmissionStepFormErrCtrl', ['$scope', 'fieldUtilities',
  function($scope, fieldUtilities) {
    var stepFormVarName = fieldUtilities.stepFormName($scope.step.id);
    $scope.stepForm = $scope.submissionForm[stepFormVarName];
}]).
controller('SubmissionFieldErrKeyCtrl', ['$scope',
  function($scope) {
    var pre = 'fieldForm_';
    var f_id = $scope.err.$name.slice(pre.length).replace(new RegExp('_', 'g'), '-');
    $scope.field = $scope.field_id_map[f_id];

    $scope.goToQuestion = function() {
      var form = document.getElementById('step-' + $scope.selection);
      var s = 'div[data-ng-form="' + $scope.err.$name + '"] .inputelem';
      var formFieldSel = form.querySelector(s);
      formFieldSel.focus();
    };
}]).
controller('SubmissionFormFieldCtrl', ['$scope',
  function($scope) {
    $scope.f = $scope[$scope.fieldFormVarName];
}])
.
controller('SubmissionFieldCtrl', ['$scope', 'fieldUtilities', function ($scope, fieldUtilities) {
  $scope.fieldFormVarName = fieldUtilities.fieldFormName($scope.field.id);

  $scope.getClass = function(field, row_length) {
    if (field.width !== 0) {
      return "col-md-" + field.width;
    }

    return "col-md-" + ((row_length > 12) ? 1 : (12 / row_length));
  };

  $scope.getAnswersEntries = function(entry) {
    if (entry === undefined) {
      return $scope.answers[$scope.field.id];
    }

    return entry[$scope.field.id];
  };

  $scope.addAnswerEntry = function(entries) {
    entries.push(angular.copy($scope.field.answer_structure));
  };

  $scope.fields = $scope.field.children;
  $scope.rows = fieldUtilities.splitRows($scope.fields);
  $scope.entries = $scope.getAnswersEntries($scope.entry);

  // If the field is type 'date' attach an option configurator for the
  // uib-datepicker modal.
  if ($scope.field.type === 'date') {
    var options = {
      showWeeks: false, // Just a sample option
    };
    var max = $scope.field.attrs.max_date.value;
    var min = $scope.field.attrs.min_date.value;
    if (angular.isDefined(max)) {
      options.maxDate = new Date(max);
    }
    if (angular.isDefined(min)) {
      options.minDate = new Date(min);
    }
    $scope.dateOptions = options;
  }

  if ($scope.field.type === 'inputbox') {
    $scope.validator = fieldUtilities.getValidator($scope.field);
  }

  $scope.status = {
    opened: false
  };

  $scope.open = function() {
    $scope.status.opened = true;
  };

  $scope.validateRequiredCheckbox = function(field, entry) {
    if (!field.required) {
      return true;
    }

    for (var i=0; i<field.options.length; i++) {
      if (entry[field.options[i].id] && entry[field.options[i].id] === true) {
        return true;
      }
    }

    return false;
  };
}]);
