define(['jquery',
    'underscore',
    'backbone',
    'App',
    'toastNotifications',
    'ajaxHelper',
    'router',
    'utils',
    'formatting',
    'fileupload',
    'gridhelper',
    '/AppJs/Views/Controls/AuctionDocumentsGridView.js',
    'selecthelper',
    'checkboxHelper',
    'constants',
    'enums',
    '/AppJs/Views/Controls/AuctionBidsGridView.js',
    '/AppJs/Views/Controls/AuctionBidsGraphView.js',
    '/AppJs/Views/Controls/AuctionBidStackGraphView.js',
    '/AppJs/Views/Controls/AuctionWAPGraphView.js',
    '/AppJs/Views/Controls/SuppliersAvailableToUseView.js',
    '/AppJs/Views/Contacts/ContactsGridView.js',
    'moment',
    'webpushhelper',
    'backbone.radio',
    'iconHelper',
    'RFQsUtils',
    'sweetalert',
    'resumeRFQModalView',
    'upgradeMembershipModalView',
    'session',
    'select',
    'parsley',
    'datepicker',
    'wizard',
    'peityCharts'], function ($, _, Bb, App, Tn, Ah, Router, Ut, Fm, Fu, Gh, AuctionDocumentsGridView, Sh, Ch, Const,
        En, AuctionBidsGridView, AuctionBidsGraphView, AuctionBidStackGraphView, AuctionWAPGraphView, SuppliersAvailableToUseView, ContactsGridView, Mm, Wph, Radio, Ih, Rh, Sa, ResumeRFQModalView, UpgradeMembershipModalView,
        Session) {
    var view = Bb.View.extend((function () {

        var appChannel = Radio.channel('app');

        var _previousBidsData = null;
        var _auctionData = null;
        var _eventData = null;
        var _previousCreditStatus = null;
        var _uploadedFiles = [];
        var _getUpdateCurrentPricesExecutionLock = false;
        var _getBidsDataExecutionLock = false;
        var _splittedTerms = null;
        var _quoteInputsActive = false;
        var _complexProductTypeIds = [3, 4, 5];

        var _showHideFieldsForCommodityType = function (currentCommodityTypeId, currentView) {
            var fieldsToShowHide = [
                currentView.DeliveryPointColumn,
                currentView.ContractProcurementAmountColumns,
                currentView.NumberOfMetersColumn,
                currentView.ContractRenewableContentRequirementColumns,
                currentView.GasPriceAssumptionColumn
            ];

            if (currentCommodityTypeId == En.CommodityTypeId.AncillaryServices) {
                _.each(fieldsToShowHide, function (element) {
                    element.hide(true);
                });
            } else {
                _.each(fieldsToShowHide, function (element) {
                    if (element == currentView.GasPriceAssumptionColumn &&
                        Session.isLoggedUserABrokerInASupplierPortal() === true) {
                        return;
                    }

                    element.show(true);
                });
            }
        }

        var _setupBreadcrumbs = function (currentView, auctionData) {
            if (auctionData.EncryptedEventId != null) {
                Ah.doAjaxRequest('GET', String.format('/api/event/{0}', auctionData.EncryptedEventId), null,
                    function (returnValue) {
                        _eventData = returnValue;
                        var eventRedirectionLink = '';
                        if (returnValue.StatusId == En.EventStatusId.Running || returnValue.StatusId == En.EventStatusId.Completed
                            || returnValue.StatusId == En.EventStatusId.ClosedNotAwarded) {

                            eventRedirectionLink = String.format('/event/{0}', returnValue.EncryptedId);
                        }
                        else {
                            eventRedirectionLink = String.format('/event/{0}/edit', returnValue.EncryptedId)
                        }


                        // we update the breadcrumb here
                        var breadcrumbs = [{
                            Link: '/events/grid',
                            Description: "Events grid"
                        },
                        {
                            Link: eventRedirectionLink,
                            Description: String.format("({0}) {1}", returnValue.Number, returnValue.Title)
                        },
                        {
                            Description: String.format("({0}) {1}", auctionData.Number, auctionData.Name)
                        }];

                        if (App.isLoggedUserASupplier() === true) {
                            breadcrumbs.splice(1, 0, {
                                Link: String.format('/events/grid/brokerage/{0}', auctionData.EncryptedCompanyId),
                                Description: auctionData.CompanyPlatformName
                            });
                        }

                        appChannel.trigger("navView:updateBreadcrumb", breadcrumbs);
                    });
            }
            else {
                var breadcrumbs = [{
                    Link: '/rfqs/grid',
                    Description: "RFQs List"
                },
                {
                    Link: String.format("/rfqs/{0}", auctionData.EncryptedId),
                    Description: String.format("({0}) {1}", auctionData.Number, auctionData.Name)
                }];

                if (App.isLoggedUserASupplier() === true) {
                    breadcrumbs.splice(1, 0, {
                        Link: String.format('/rfqs/grid/brokerage/{0}', auctionData.EncryptedCompanyId),
                        Description: auctionData.CompanyPlatformName
                    });
                }

                appChannel.trigger("navView:updateBreadcrumb", breadcrumbs);
            }
        }

        var _refreshBiddingChart = function (currentView) {
            var term = currentView.termSelected;
            var isMobile = (typeof window.orientation !== "undefined") || (navigator.userAgent.indexOf('IEMobile')) !== -1;

            var graphHeight = "400px";
            if (currentView.BidsGraphColumn.is(":visible") === true) {
                if (currentView.PricesDistributionGraphInstance == null) {
                    currentView.PricesDistributionGraphInstance = new AuctionBidsGraphView();
                    currentView.PricesDistributionGraphInstance.options.auctionData = _auctionData;
                    currentView.PricesDistributionGraphInstance.direction = _auctionData.AuctionDirectionId;
                    if (!isMobile) {
                        currentView.PricesDistributionGraphInstance.options.height = graphHeight;
                    }
                    currentView.PricesDistributionGraphContainer.html(currentView.PricesDistributionGraphInstance.render().el);
                }

                currentView.PricesDistributionGraphInstance.options.rfqProductId = _getCurrentProductTypeObject(currentView).Id;
                currentView.PricesDistributionGraphInstance.refreshGraph("all", term);


                if (_auctionData.AuctionTypeId === En.AuctionTypeId.OpenBid || _auctionData.AuctionTypeId === En.AuctionTypeId.WholesaleOpen) {

                    if (currentView.LowestPricesGraphInstance == null) {
                        currentView.LowestPricesGraphInstance = new AuctionBidsGraphView();
                        currentView.LowestPricesGraphInstance.options.auctionData = _auctionData;
                        if (!isMobile) {
                            currentView.LowestPricesGraphInstance.options.height = currentView.PricesDistributionGraphInstance.options.height;
                        }
                        currentView.LowestPricesGraphContainer.html(currentView.LowestPricesGraphInstance.render().el);
                    }

                    currentView.LowestPricesGraphInstance.options.rfqProductId = _getCurrentProductTypeObject(currentView).Id;
                    currentView.LowestPricesGraphInstance.refreshGraph("lowest", term);
                }

                if (_auctionData.IsWholesale === true || (_auctionData.IsWholesale === false && _auctionData.AuctionDirectionId == En.AuctionDirectionId.Forward)) {

                    if (currentView.BidStackGraphInstance == null) {
                        currentView.BidStackGraphInstance = new AuctionBidStackGraphView();
                        currentView.BidStackGraphInstance.options.auctionData = _auctionData;
                        if (!isMobile) {
                            currentView.BidStackGraphInstance.options.height = currentView.PricesDistributionGraphInstance.options.height;
                        }
                        currentView.BidStackGraphContainer.html(currentView.BidStackGraphInstance.render().el);
                    }

                    currentView.BidStackGraphInstance.options.rfqProductId = _getCurrentProductTypeObject(currentView).Id;
                    currentView.BidStackGraphInstance.refreshGraph(En.BidStackChartType.Optimized, term);

                    if (currentView.WAPGraphInstance == null) {
                        currentView.WAPGraphInstance = new AuctionWAPGraphView();
                        currentView.WAPGraphInstance.options.auctionData = _auctionData;
                        if (!isMobile) {
                            currentView.WAPGraphInstance.options.height = currentView.PricesDistributionGraphInstance.options.height;
                        }
                        currentView.WAPGraphContainer.html(currentView.WAPGraphInstance.render().el);
                    }

                    currentView.WAPGraphInstance.refreshGraph();
                }

            }

            if (_auctionData != null && _auctionData.AuctionDirectionId == En.AuctionDirectionId.Forward) {
                $("th:contains('Total Quantity Sought')").text("Total Quantity Available");
                $("[href='#suppliers']").text("Bidders");
                $("th:contains('Total Unique Suppliers')").text("Total Unique Bidders");
                $("h5:contains('Low Supplier')").text("High Bidder");
                $("[href='#lowestPricesGraphTab']").text("Highest Quote");
                $("option:contains('Low price - Only show lowest quote per term')").text("High price - Only show highest quote per term");
                $("h5:contains('Low Quote')").text("High Quote");
                $("th:contains('Low Price')").text("High Price");

                var lowHighPriceSpan = $("span[name='currentPriceWinner']");
                if (_auctionData.AuctionTypeId != En.AuctionTypeId.SealedBid) {
                    lowHighPriceSpan.text("You must submit at least one quote in order to view the current high quote.");
                } else {
                    lowHighPriceSpan.text("");
                }

                $("button[name='addSuppliersBtn']").text("Add Bidders");
                $("[href='#collapseRemoveSuppliers']").text("Current Bidders");
                $("[href='#collapseAddSuppliers']").text("Add Bidders");
                $("[href='#collapseMessageSuppliers']").text("Message Bidders");
                $("th:contains('Supplier')").text("Bidder");
                $("h5:contains('Suppliers')").text("Bidders");
            }
        }

        var _refreshBidHistoryGrid = function (currentView) {
            if (currentView.bidsGridInstance != null) {
                if (App.isLoggedUserASupplier() === false) {
                    currentView.bidsGridInstance.options.rfqProductId = _getCurrentProductTypeObject(currentView).Id;
                }

                currentView.bidsGridInstance.refreshGrid();
            }
        }

        var _isOldBidsDataEqualToNewBidsData = function (newBidsData) {
            if (_previousBidsData == null && newBidsData != null) {
                return false;
            }
            else if (newBidsData != null) {
                if (_previousBidsData.BidsHistoryData.length !=
                    newBidsData.BidsHistoryData.length) {
                    return false;
                }
                else {
                    // we compare only grid data since the chart has the same
                    for (var i = 0; i < _previousBidsData.BidsHistoryData.length; i++) {
                        if (_previousBidsData.BidsHistoryData[i].Id != newBidsData.BidsHistoryData[i].Id ||
                            _previousBidsData.BidsHistoryData[i].DeletedDateTime != newBidsData.BidsHistoryData[i].DeletedDateTime) {
                            return false;
                        }
                    }
                }
            }

            return true;
        }

        var _recalculateSavings = function (currentView) {
            if (App.isLoggedUserASupplier() === false) {
                Ah.doAjaxRequest('GET', String.format('/api/rfqs/{0}/bidsSummary/{1}',
                    currentView.options.encryptedAuctionId,
                    _getCurrentProductTypeObject(currentView).Id),
                    null,
                    function (responseData) {

                        if (responseData.TotalBidsReceived == 0) {
                            currentView.QuoteSummaryPanel.hide();
                        } else {
                            currentView.QuoteSummaryPanel.show();
                        }

                        currentView.TotalBidsReceived.html(responseData.TotalBidsReceived);
                        currentView.TotalUniqueBidders.html(responseData.TotalUniqueBidders);

                        if (_auctionData.IsWholesale == false) {
                            currentView.SavingsVsBenchmark.html('');
                            if (responseData.SavingsVsBenchmark.length) {

                                var savingsVsBenchmarkData = responseData.SavingsVsBenchmark;


                                if (responseData.SavingsVsBenchmark.length === 1) {
                                    var currentBenchmarkSavings = savingsVsBenchmarkData[0];
                                    var genericWidget = currentView.$el.find("#genericWidgetTemplate").html();
                                    genericWidget = genericWidget.replace(/{widgetDescription}/g, "Savings vs.<br /> Benchmark")
                                    genericWidget = genericWidget.replace(/{widgetContent}/g, Fm.formatPrice(currentBenchmarkSavings.Savings, Const.MONEY_SYMBOL, null, 0));
                                    currentView.SavingsVsBenchmark.append(genericWidget);
                                } else {

                                    currentView.SavingsVsBenchmark.append("<h4>Savings vs. Benchmark</h4>");
                                    var savingsVsBenchmarkTable = $("<table class='table table-stripped small m-t-md'><tbody></tbody></table>");

                                    for (var i = 0; i < savingsVsBenchmarkData.length; i++) {
                                        var currentBenchmarkSavings = savingsVsBenchmarkData[i];
                                        var savingsRow = currentView.$el.find("#reserveSavingsRowTemplate").html();
                                        savingsRow = savingsRow.replace(/{term}/g, String.format("{0} mo. Term: {1}", currentBenchmarkSavings.Term, Fm.formatPrice(currentBenchmarkSavings.Savings, Const.MONEY_SYMBOL, null, 0)));
                                        savingsVsBenchmarkTable.find("tbody").append($(savingsRow));
                                    }
                                    currentView.SavingsVsBenchmark.append(savingsVsBenchmarkTable);
                                }
                            }
                            else {
                                //It was requsted that the widget simply not show in this case, so the below code
                                //is commented out for now in case it is reqested back at a later point in time:
                                //var genericWidget = currentView.$el.find("#genericWidgetTemplate").html();
                                //genericWidget = genericWidget.replace(/{widgetDescription}/g, "Savings vs.<br /> Benchmark")
                                //genericWidget = genericWidget.replace(/{widgetContent}/g, Const.NOT_AVAILABLE_ACRONYM);
                                //currentView.SavingsVsBenchmark.append(genericWidget);
                            }

                            currentView.SavingsVsReserve.html('');
                            if (responseData.SavingsVsReserve.length) {

                                var savingsVsReserveData = responseData.SavingsVsReserve;

                                if (savingsVsReserveData.length === 1) {

                                    var currentReserveSavings = savingsVsReserveData[0];
                                    var genericWidget = currentView.$el.find("#genericWidgetTemplate").html();
                                    genericWidget = genericWidget.replace(/{widgetDescription}/g, "Savings vs.<br /> Reserve");
                                    genericWidget = genericWidget.replace(/{widgetContent}/g, Fm.formatPrice(currentReserveSavings.Savings, Const.MONEY_SYMBOL, null, 0));
                                    currentView.SavingsVsReserve.append(genericWidget);
                                } else {

                                    currentView.SavingsVsReserve.append("<h4>Savings vs. Reserve");
                                    var savingsVsReserveTable = $("<table class='table table-stripped small m-t-md'><tbody></tbody></table>");

                                    for (var i = 0; i < savingsVsReserveData.length; i++) {
                                        var currentReserveSavings = savingsVsReserveData[i];
                                        var savingsRow = currentView.$el.find("#reserveSavingsRowTemplate").html();
                                        savingsRow = savingsRow.replace(/{term}/g, String.format("{0} mo. Term: {1}", currentReserveSavings.Term, Fm.formatPrice(currentReserveSavings.Savings, Const.MONEY_SYMBOL, null, 0)));
                                        savingsVsReserveTable.find("tbody").append($(savingsRow));
                                    }
                                    currentView.SavingsVsReserve.append(savingsVsReserveTable);
                                }

                            }
                            else {
                                //It was requsted that the widget simply not show in this case, so the below code
                                //is commented out for now in case it is reqested back at a later point in time:
                                //var genericWidget = currentView.$el.find("#genericWidgetTemplate").html();
                                //genericWidget = genericWidget.replace(/{widgetDescription}/g, "Savings vs.<br /> Reserve");
                                //genericWidget = genericWidget.replace(/{widgetContent}/g, Const.NOT_AVAILABLE_ACRONYM);
                                //currentView.SavingsVsReserve.append(genericWidget);
                            }

                            if (currentView.SavingsVsTarget != undefined) {
                                //CM-14514
                                currentView.SavingsVsTarget.html('');
                                if (responseData.SavingsVsTarget.length) {

                                    var savingsVsTargetData = responseData.SavingsVsTarget;

                                    if (savingsVsTargetData.length === 1) {

                                        var currentTargetSavings = savingsVsTargetData[0];
                                        var genericWidget = currentView.$el.find("#genericWidgetTemplate").html();
                                        genericWidget = genericWidget.replace(/{widgetDescription}/g, "Savings vs.<br /> Target");
                                        genericWidget = genericWidget.replace(/{widgetContent}/g, Fm.formatPrice(currentTargetSavings.Savings, Const.MONEY_SYMBOL, null, 0));
                                        currentView.SavingsVsTarget.append(genericWidget);
                                    } else {

                                        currentView.SavingsVsTarget.append("<h4>Savings vs. Target");
                                        var savingsVsTargetTable = $("<table class='table table-stripped small m-t-md'><tbody></tbody></table>");

                                        for (var i = 0; i < savingsVsTargetData.length; i++) {
                                            var currentTargetSavings = savingsVsTargetData[i];
                                            var savingsRow = currentView.$el.find("#reserveSavingsRowTemplate").html();
                                            savingsRow = savingsRow.replace(/{term}/g, String.format("{0} mo. Term: {1}", currentTargetSavings.Term, Fm.formatPrice(currentTargetSavings.Savings, Const.MONEY_SYMBOL, null, 0)));
                                            savingsVsTargetTable.find("tbody").append($(savingsRow));
                                        }
                                        currentView.SavingsVsTarget.append(savingsVsTargetTable);
                                    }

                                }
                            }


                        } else {
                            currentView.SavingsVsBenchmark.hide();
                            currentView.SavingsVsReserve.hide();
                            //CM-14514
                            currentView.SavingsVsTarget.hide();
                        }


                        if (responseData.CurrentLowPrice != null) {
                            currentView.LowPriceWidget.show();
                            if (responseData.SavingsVsTarget.length > 0 && currentView.LowPriceWidget.find("#targetIcon").length < 1) {
                                currentView.LowPriceWidget.prepend("<span><div id='targetIcon' class='fa fa-bullseye fa-2x fa-4x' style='float: right;'></div></span>");
                            }
                            currentView.CurrentLowPrice.html(Fm.formatPrice(responseData.CurrentLowPrice, Const.MONEY_SYMBOL, null, 5));
                        }
                        else {
                            currentView.LowPriceWidget.hide();
                            currentView.CurrentLowPrice.html(Const.NOT_AVAILABLE_ACRONYM);
                        }

                        if (responseData.CurrentLowSupplier != null) {
                            currentView.LowSupplierWidget.show();
                            currentView.CurrentLowSupplier.html(responseData.CurrentLowSupplier);
                            currentView.LowSupplierLogo.html('');
                            currentView.LowSupplierLogo.append(String.format("<img style='max-width:50%;max-height:84px' src='/api/company/{0}/logo'/>", responseData.CurrentLowSupplierCompanyId));
                        }
                        else {
                            currentView.LowSupplierWidget.hide();
                            currentView.CurrentLowSupplier.html(Const.NOT_AVAILABLE_ACRONYM);
                        }
                    },
                    null,
                    null,
                    false);
            }
        };


        var _refreshSupplierCreditStatuses = function (currentView) {
            if (currentView.SupplierCreditStatusesGridInstance != null && currentView.SupplierCreditStatusesGridInstance != undefined) {
                Gh.refreshGrid(currentView.SupplierCreditStatusesGrid);
            }
            else {
                var columns = [
                    {
                        data: "SupplierCompanyName", mRender: Gh.columnStringFormatter
                    },
                    {
                        data: "StatusAsString", mRender: Gh.columnStringFormatter
                    },
                    {
                        data: "DepositAmount", sortable: false, mRender: function (data, type, full) {

                            var toReturn = Const.NOT_SPECIFIED_ACRONYM;
                            if (data != null && data != undefined) {
                                toReturn = Fm.formatPrice(data, Const.MONEY_SYMBOL, null);
                            }

                            return toReturn;
                        }
                    }];

                if (currentView.options.removeCommentsColumn === false ||
                    currentView.options.removeCommentsColumn === undefined) {
                    columns.push(
                        {
                            data: "OtherStatus", sortable: false, mRender: Gh.columnStringFormatter
                        });
                }

                console.log("Entro a la llamada del else grid de statuses");
                currentView.SupplierCreditStatusesGridInstance = Gh.createGridForAjax(currentView.SupplierCreditStatusesGrid,
                    String.format('/api/rfqs/{0}/creditStatus/list', currentView.options.encryptedAuctionId),
                    columns,
                    {
                        searching: false,
                        destroy: true,
                        emptyTableMessage: 'No credit statuses have been created yet.'
                    });
            }
        };

        var _getBidsData = function (currentView) {
            // goes to the server to get the data and then 
            // refresh items dependant on bids data
            if (_getBidsDataExecutionLock === false) {
                _getBidsDataExecutionLock = true;
                appChannel.trigger("auctionBidView:gettingBid");

                _refreshBidHistoryGrid(currentView);
                _refreshBiddingChart(currentView);

                _getBidsDataExecutionLock = false;
                _recalculateSavings(currentView);

                appChannel.trigger("auctionBidView:finishedGettingBid");
            }
        }

        var _refreshCreditStatusInputs = function (currentView) {
            if (App.isLoggedUserASupplier() === true) {
                Ah.doAjaxRequest('GET', String.format('/api/rfqs/{0}/creditStatus', currentView.options.encryptedAuctionId), null, function (responseData) {
                    if (responseData != null) {
                        Sh.addOption(currentView.CreditStatusesDDL, responseData.StatusId, responseData.StatusAsString);
                        currentView.CreditStatusesDDL.change();
                        currentView.DepositAmount.val(responseData.DepositAmount);
                        currentView.CreditStatusComments.val(responseData.OtherStatus);
                        _previousCreditStatus = responseData;
                        _disableUpdateCreditStatusButton(currentView);
                    } else {
                        _enableUpdateCreditStatusButton(currentView);
                    }
                });
            }
        };

        var _refreshDocuments = function (currentView) {

            Ah.doAjaxRequest('GET', String.format('/api/rfqs/{0}/document/list', currentView.options.encryptedAuctionId), null, function (responseData) {
                if (responseData != null) {
                    currentView.documentsGridInstance.options.localDataSource = responseData;
                    currentView.documentsGridInstance.refreshGrid();
                }
            });
        }

        var _disableUpdateCreditStatusButton = function (currentView) {
            currentView.UpdateSupplierCreditStatusBtn.attr('disabled', 'disabled');
            currentView.UpdateSupplierCreditStatusBtn.addClass('disabled');
        };

        var _enableUpdateCreditStatusButton = function (currentView) {
            currentView.UpdateSupplierCreditStatusBtn.attr('disabled', false);
            currentView.UpdateSupplierCreditStatusBtn.removeClass('disabled');
        };

        var _setCurrentProductTypeDDLReference = function (currentView) {
            currentView.CurrentProductTypeDDL = currentView.$el.find("#currentProductTypeDDL");
        }

        var _fillCurrentBidRowTerm = function (currentView, auctionData, bidRowTemplate, currentTerm, tableBody, alternateTerm) {
            var currentRow = bidRowTemplate;
            if (alternateTerm) {
                currentTerm = "{termNumber}";
            }
            if (!alternateTerm) {
                currentRow = currentRow.replace(/{termNumber}/g, currentTerm);
            }
            currentRow = currentRow.replace(/{usageUnit}/g, auctionData.Deal.ProcurementUnitName);
            currentRow = currentRow.replace(/{pricingUnit}/g, auctionData.FeeUsageUnit);
            currentRow = currentRow.replace(/{minimumQuantity}/g, auctionData.WholesaleMinimumQuantity);
            currentRow = currentRow.replace(/{minimumQuantityIncrement}/g, auctionData.WholesaleMinimumQuantityIncrement);

            tableBody.append(currentRow);

            var justAddedRow = tableBody.find(String.format("[data-term='{0}']", currentTerm));

            // this is also used in RFQConfirmView.js so modifications here should be considered there as well
            var currentProductTypeObject = _getCurrentProductTypeObject(currentView).ProductType;

            if (alternateTerm) {
                var termColumn = justAddedRow.find("[name='termNumber']").parent();
                termColumn.empty();
                termColumn.append("<form name='newTermForm' novalidate><input id='bidTermInput' type='number' min='0' step='1' class='form-control' placeholder='Term' data-parsley-price-value required></form>");
                termColumn.attr('class', 'col-md-3');
                justAddedRow.find("[name='bidControlsColumn']").attr('colspan', '2');
                justAddedRow.find("[id='currentPriceWinnerColumn']").remove();
                justAddedRow.find("[name='declineBidBtn']").remove();
                tableBody.find("[data-target='#WAPDetailsCollapse-{termNumber}']").attr('data-target', '#WAPDetailsCollapse-termNumber');
                tableBody.find("[id='WAPDetailsCollapse-{termNumber}']").attr('id', 'WAPDetailsCollapse-termNumber');
                currentTerm = "termNumber";
            }

            if (currentProductTypeObject.UsePrice === true) {
                justAddedRow.find("#bidPriceInput").closest(".input-group").show();

                //****************************************************************************************
                //This featurre is just for show right now.  It will eventually be required for Tariff Bid RFQs, but for now it is 
                //meant only to be a mock-up of the UI.

                if (currentProductTypeObject.Name == "WAP") {
                    justAddedRow.find("[name='showWAPDetails']").show();
                    var WAPCollapse = tableBody.find(String.format("#WAPDetailsCollapse-{0}", currentTerm));
                    var WAPInputs = WAPCollapse.find('[name="WAPInput"]');
                    WAPInputs.on('change', function () {
                        var weightedAverage = 0;
                        var numberOfInputs = WAPInputs.length;

                        for (var i = 0; i < numberOfInputs; i++) {
                            var currentInput = $(WAPInputs[i]);
                            if (currentInput.val() != undefined) {
                                weightedAverage += currentInput.val() / numberOfInputs;
                            }
                        }

                        justAddedRow.find("#bidPriceInput").val(weightedAverage.toFixed(5));

                    });
                }
                //****************************************************************************************
            }
            if (currentView.IsBidBehalfOnSupplier === true) {
                justAddedRow.find("#currentPriceWinnerColumn").remove();
            }

            if (currentProductTypeObject.UseAdder === true) {
                justAddedRow.find("#bidAdderInput").closest(".input-group").show();
            }

            if (currentProductTypeObject.UseMultiplier === true) {
                justAddedRow.find("#bidMultiplierInput").closest(".input-group").show();
            }

            if (currentProductTypeObject.UseOnAdder === true) {
                justAddedRow.find("#bidOnAdderInput").closest(".input-group").show();
            }

            if (currentProductTypeObject.UseOffAdder === true) {
                justAddedRow.find("#bidOffAdderInput").closest(".input-group").show();
            }

            if (currentProductTypeObject.UseQuantity === true) {
                justAddedRow.find("#bidQuantityInput").closest(".input-group").show();
            }
        }

        var _showBiddingPanel = function (currentView, show, auctionData) {
            var bidRowTemplate = currentView.$el.find("#bidRowTemplate").html();
            currentView.BiddingControlsColumn.show(show);
            if (App.isLoggedUserABrokerUser() == false) {
                currentView.$el.find("#generalProductTypeSelector").remove();
            }
            if (App.isLoggedUserABrokerUser() === true && show === true) {
                _refreshBiddingChart(currentView);
            }

            _setCurrentProductTypeDDLReference(currentView);
            currentView.BidTypeTableHeader.html(auctionData.AuctionTypeId == En.AuctionTypeId.OpenBid || auctionData.AuctionTypeId == En.AuctionTypeId.WholesaleOpen ?
                Const.BID_LABEL_FOR_OPEN_BID_AUCTION : Const.BID_LABEL_FOR_SEALED_OR_DIRECT_BID_AUCTION);



            if (show === true) {
                var terms = auctionData.Deal.TermsList.split(',');

                var tableBody = "";
                if (currentView.IsBidBehalfOnSupplier === true) {
                    tableBody = currentView.SubmitBidGridForBroker.find("#tableBodySubmission");
                    currentView.BidTypeTableHeader.remove();

                }
                else {
                    tableBody = currentView.SubmitBidGrid.find("#tableBodySubmission");
                }
                tableBody.html('');

                var productTypeName = _getCurrentProductTypeObject(currentView).ProductType.Name;
                if (currentView.IsBidBehalfOnSupplier === true) {
                    currentView.SubmitBidGridForBroker.find("#contractProductType").html(productTypeName);
                } else {
                    currentView.SubmitBidGrid.find("#contractProductType").html(productTypeName);
                }

                $("div .ibox-content:has(div.sk-spinner-double-bounce)").prev().attr("style", "padding: 5px 5px 10px 5px;");
                $("div .ibox-content:has(div.sk-spinner-double-bounce)").attr("style", "padding: 0px 20px 20px 20px;");
                $(".suppR").remove();
                $("#startingPriceFieldsGroup").remove();


                for (var i = 0; i < terms.length; i++) {
                    var currentTerm = terms[i];
                    _fillCurrentBidRowTerm(currentView, auctionData, bidRowTemplate, currentTerm, tableBody, false);
                }

                if (auctionData.AllowQuoteAlternateTerm && App.isLoggedUserASupplier()) {
                    _fillCurrentBidRowTerm(currentView, auctionData, bidRowTemplate, null, tableBody, true);
                }

                if (terms.length > 1) {
                    currentView.BidAllButton.show();
                    $("[name='declineBidBtn']").remove();
                    var multipleBidDeclineBtn = $('<button class="btn btn-default" name="declineBidBtn" data-toggle="modal" data-target="#declineBidFormContainer" title="Decline to Bid"  data-loading-text="<i class=&quot;fa fa-spinner fa-spin&quot;></i> Declining...">Decline to Bid</button>');
                    multipleBidDeclineBtn.appendTo(currentView.BidAllButton.parent());
                    currentView.BidAllButton.parent().attr('class', 'col-md-8 col-md-offset-3');
                }

                if (auctionData.UserNumberOfBids > 0) {
                    $("[name='declineBidBtn']").remove();
                    if (terms.length > 1) {
                        currentView.BidAllButton.parent().attr('class', 'col-md-4 col-md-offset-5');
                    }
                }

                if (window.location.href.includes("#declineBidForm")) {
                    currentView.DeclineBidFormContainer.modal();
                    window.history.replaceState({}, "#declineBidForm", "Bid");
                }

                var commentsIcon = tableBody.find("[name='showComments']");

                if (auctionData.EnableComments === true) {
                    commentsIcon.on("click", function () {
                        var button = $(this);
                        var rowToHideOrShow = button.parent().parent().next();

                        if (rowToHideOrShow.is(":visible") === false) {
                            rowToHideOrShow.show(300);
                        }
                        else {
                            rowToHideOrShow.hide(300);
                        }
                    });
                }
                else {
                    currentView.$el.find("#commentsIconHeader").remove();
                    commentsIcon.parent().remove();
                }

                //manually clear values from the comment fields, since IE copies placeholder text into the text areas value.
                var termsArray = auctionData.Deal.TermsList.split(',');
                termsArray.forEach(function (term) {
                    $(String.format("tr[data-term='{0}']", term)).next().find("#bidCommentArea").val('');
                });

                $("[id='bidCommentArea']").on('keyup', function () {
                    var textArea = $(this);

                    var buttonToDecorate = textArea.parent().parent().prev().find("[name='showComments']");

                    var classWhenFill = 'btn-warning';
                    var classWhenEmpty = 'btn-default';
                    if (textArea.val().trim().length > 0) {
                        buttonToDecorate.addClass(classWhenFill);
                        buttonToDecorate.removeClass(classWhenEmpty);
                    }
                    else {
                        buttonToDecorate.addClass(classWhenEmpty);
                        buttonToDecorate.removeClass(classWhenFill);
                    }
                });

                currentView.options.AuctionTypeId = auctionData.AuctionTypeId;
                _updateCurrentPrices(currentView);

                //ECX has asked that we disable this for now.
                //if (_auctionData.IsWholesale && _auctionData.BlindDuringBidEntry == true) {
                //    var inputs = $("form[data-term]").find("input");
                //    for (var i = 0; i < inputs.length; i++) {
                //        var input = $(inputs[i]);
                //        input.on('focus', function () {
                //            _quoteInputsActive = true;
                //            $("span[name='currentPriceWinner']").html('<i class="fa fa-eye-slash fa-3x" aria-hidden="true"></i>').parent().removeClass('bg-primary');
                //        });

                //        input.on('focusout', function () {
                //            var allInputsBlank = true;
                //            for (var i = 0; i < inputs.length; i++) {
                //                var currentInput = $(inputs[i]);
                //                if (currentInput.val() > 0) {
                //                    allInputsBlank = false;
                //                    break;
                //                }
                //            }
                //            if (allInputsBlank) {
                //                _quoteInputsActive = false;
                //                _updateCurrentPrices(currentView);
                //            }
                //        });
                //    }
                //}
            }
        }

        var _eventBinding = null;
        var _startPushNotifications = function (currentView, auctionData) {
            String.prototype.replaceAll = function (search, replacement) {
                var target = this;
                return target.split(search).join(replacement);
            }

            var channel = Wph.subscribeToChannel(auctionData.WebNotificationsChannel);

            _eventBinding = [channel,
                {
                    name: En.RFQEvents.newBidDataAvailable,
                    handler: function (data) {
                        _getBidsData(currentView);
                        _updateCurrentPrices(currentView);
                        //recalculate savings here
                    }
                },
                {
                    name: "auction:auctionEnded",
                    handler: function (data) {
                        redirectToAuctionPageWithBidTab();
                    }
                },
                {
                    name: "auction:documentDeleted",
                    handler: function (data) {
                        _refreshDocuments(currentView);
                    }
                },
                {
                    name: "auction:documentAdded",
                    handler: function (data) {
                        _refreshDocuments(currentView);
                    }
                },
                {
                    name: "auction:auctionStarted",
                    handler: function (data) {
                        refreshPage();
                    }
                },
                {
                    name: "auction:creditStatusUpdated",
                    handler: function (data) {
                        if (App.isLoggedUserASupplier() === true) {
                            _refreshSupplierCreditStatuses(currentView);
                        }
                    }
                },
                {
                    name: "auction:auctionEdited",
                    handler: function (data) {
                        if (data != null) {
                            var dataObject = JSON.parse(data.message.replaceAll(",", ":").replaceAll("@", ",").replaceAll("[", "").replaceAll("]", ""));
                            Ah.doAjaxRequest('GET', String.format('/api/rfqs/{0}', auctionData.EncryptedId), null,
                                function (returnValue) {
                                    if (returnValue != null) {
                                        currentView.AuctionTitle.empty();
                                        _fillAuctionData(currentView, returnValue);
                                        if (returnValue.CanBid === true) {
                                            // this user can bid so we show the bid panel
                                            _showBiddingPanel(currentView, true, returnValue);

                                            if (currentView.IsBidBehalfOnSupplier === true) {
                                                currentView.BiddingControlsColumn.remove();
                                            }
                                        }
                                        Tn.ShowInfo(String.format("The RFQ has been updated by {0} at {1}", dataObject.ActionUserName, dataObject.BrokerName));
                                    }
                                });
                        }
                    }
                },
                {
                    name: "auction:auctionExtended",
                    handler: function (data) {
                        if (data != null) {
                            //Update the timer function running on the view by clearing the existing one and kicking off a new one with the updated end time
                            var pieSpan = currentView.$el.find("span[name='remainingTimePieChart']");
                            var textSpan = currentView.$el.find("p[name='remainingTimeMessage']");
                            Rh.clearRFQRemainingTimeFunctions();
                            Rh.triggerRFQRemainingTimeMessage(pieSpan, textSpan, _auctionData.EncryptedId, _auctionData.ActualStartTime, data.message, 32);

                            if (_auctionData.CanExtend) {
                                currentView.ExtendRFQ.removeClass('visibilityNone');
                            }
                        }
                    }
                }];

            var redirectToAuctionPageWithBidTab = function () {
                Router.goToRoute(String.format("/rfqs/{0}/bids", _auctionData.EncryptedId));
                Tn.ShowInfo("The RFQ has ended, so you have been redirected to its details page.");
            }

            var refreshPage = function () {
                window.location.reload();
            }

            Wph.bindEvents(_eventBinding);
        }

        var _checkIfAProductExistInAuction = function (productsInAuction, productId) {
            var toReturn = false;
            if (productsInAuction.length > 0) {
                for (var i = 0; i < productsInAuction.length; i++) {
                    if (productsInAuction[i].ProductType.Id == productId) {
                        toReturn = true;
                    }
                }
            }
            return toReturn;
        }

        var _fillAuctionData = function (currentView, auctionData) {

            if (auctionData.StatusId != En.AuctionStatusId.Running) {
                window.location = 'view';
            }
            else {
                _auctionData = auctionData;
                _splittedTerms = auctionData.Deal.TermsList.split(',');


                //Fill auction info

                currentView.AuctionTypeColumn.html(auctionData.AuctionTypeName);
                currentView.AuctionNameColumn.html(auctionData.Name);
                currentView.AuctionStartTimeColumn.html(Fm.formatDateAndTime(Ut.getMomentDateAndTimeFromServer(auctionData.ActualStartTime)));

                if (auctionData.Guidelines != null &&
                    auctionData.Guidelines.length > 0) {
                    currentView.showGuidelinesBtn.append("<span id='guidelinesWarningBtn' style='left: 6px;position: relative; display: inline;' class='label label-danger customPulse-danger'>!</span>");
                    currentView.showGuidelinesBtn.on("click", function () {
                        currentView.showGuidelinesBtn.find("#guidelinesWarningBtn").removeClass('customPulse-danger');
                    });
                }

                if (auctionData.QAndA != null &&
                    auctionData.QAndA.length > 0) {
                    currentView.showQABtn.prepend("<span class='badge badge-info'><i class='fa fa-info'></i></span>&nbsp");
                    currentView.showQABtn.addClass('btn-lg');
                }

                Fm.showStringOrDefaultValue(auctionData.Guidelines, "There are no specific guidelines available to display.", currentView.AuctionGuidelinesModalBodyContainer);
                Fm.showStringOrDefaultValue(auctionData.QAndA, "There are no Q&A available to display.", currentView.AuctionQAndAModalBodyContainer);
                currentView.AuctionAccessTypeColumn.html(auctionData.AuctionAccessTypeName);
                currentView.AuctionChatSettingsColumn.html(auctionData.EnableChat === false ? 'Disabled' : 'Enabled');
                currentView.AuctionPriceCommentsColumn.html(auctionData.EnableComments === false ? 'Disabled' : 'Enabled');
                currentView.AuctionDescriptionColumn.html(!auctionData.Description ? Const.NOT_SPECIFIED_ACRONYM : auctionData.Description);
                currentView.AuctionNumberColumn.html(auctionData.Number);
                currentView.AuctionTargetPriceColumn.html(auctionData.TargetPrice === null ? Const.NOT_SPECIFIED_ACRONYM : Fm.formatPrice(auctionData.TargetPrice, Const.MONEY_SYMBOL, auctionData.FeeUsageUnit));
                if (App.isLoggedUserASupplier() === false) {
                    currentView.AuctionBenchmarkPriceColumn.html(auctionData.BenchmarkPrice === null ? Const.NOT_SPECIFIED_ACRONYM : Fm.formatPrice(auctionData.BenchmarkPrice, Const.MONEY_SYMBOL, auctionData.FeeUsageUnit));
                    currentView.AuctionReservePriceColumn.html(auctionData.ReservePrice === null ? Const.NOT_SPECIFIED_ACRONYM : Fm.formatPrice(auctionData.ReservePrice, Const.MONEY_SYMBOL, auctionData.FeeUsageUnit));
                } else {
                    $("#retailRFQDetailsTable tr:first").children().each(function () {
                        if ($(this).prop("colSpan") === 3) {
                            $(this).prop("colSpan", 5);
                        } else {
                            $(this).hide();
                        }
                    })
                    $("#auctionDescriptionColumn").prop("colSpan", 5);
                    $("#auctionBenchmarkPriceColumn").hide();
                    $("#auctionReservePriceColumn").hide();
                }


                if (auctionData.IsWholesale === true) {
                    currentView.WholesaleContractInfoTable.show();
                    currentView.WholesaleRFQDetailsTable.show();

                    currentView.RetailContractInfoTable.hide();
                    currentView.RetailRFQDetailsTable.hide();

                    currentView.MetersTab.hide();
                    currentView.CurrentSupplierCreditStatusRow.hide();

                    currentView.WholesaleMinimumQuantityColumn.html(auctionData.FormattedMinimumQuantity);
                    currentView.WholesaleTotalQuantitySoughtColumn.html(Fm.formatQuantity(auctionData.WholesaleTotalQuantitySought, auctionData.Deal.ProcurementUnitName));
                    currentView.WholesaleTargetPriceColumn.html(auctionData.TargetPrice === null ? Const.NOT_SPECIFIED_ACRONYM : Fm.formatPrice(auctionData.TargetPrice, Const.MONEY_SYMBOL, auctionData.FeeUsageUnit));
                    currentView.MinimumQuantityValue.html(Fm.formatQuantity(auctionData.WholesaleMinimumQuantity, auctionData.Deal.ProcurementUnitName));
                    currentView.MinimumQuantityFieldsGroup.removeClass("visibilityNone");
                    currentView.MinimumQuantityIncrementValue.html(Fm.formatQuantity(auctionData.WholesaleMinimumQuantityIncrement, auctionData.Deal.ProcurementUnitName));
                    currentView.MinimumQuantityIncrementFieldsGroup.removeClass("visibilityNone");
                }
                else {
                    if (auctionData.AuctionDirectionId == En.AuctionDirectionId.Forward) {
                        currentView.WholesaleContractInfoTable.show();
                        currentView.RetailContractInfoTable.hide();
                        currentView.CurrentSupplierCreditStatusRow.hide();

                        currentView.WholesaleMinimumQuantityColumn.html(auctionData.FormattedMinimumQuantity);
                        currentView.WholesaleTotalQuantitySoughtColumn.html(Fm.formatQuantity(auctionData.WholesaleTotalQuantitySought, auctionData.Deal.ProcurementUnitName));
                        currentView.WholesaleTargetPriceColumn.html(auctionData.TargetPrice === null ? Const.NOT_SPECIFIED_ACRONYM : Fm.formatPrice(auctionData.TargetPrice, Const.MONEY_SYMBOL, auctionData.FeeUsageUnit));
                        currentView.MinimumQuantityValue.html(Fm.formatQuantity(auctionData.WholesaleMinimumQuantity, auctionData.Deal.ProcurementUnitName));
                        currentView.MinimumQuantityFieldsGroup.removeClass("visibilityNone");
                        currentView.MinimumQuantityIncrementValue.html(Fm.formatQuantity(auctionData.WholesaleMinimumQuantityIncrement, auctionData.Deal.ProcurementUnitName));
                        currentView.MinimumQuantityIncrementFieldsGroup.removeClass("visibilityNone");
                    }

                    if (App.isLoggedUserASupplier() === false && auctionData.AuctionDirectionId != En.AuctionDirectionId.Forward) {
                        //display list of supplier credit statuses
                        currentView.SupplierCreditStatusesRow.show();
                        _refreshSupplierCreditStatuses(currentView);
                    }

                    if (auctionData.HasMeters === false) {
                        currentView.MetersTab.hide();
                    }
                }

                if ((auctionData.IsWholesale == true) && _checkIfAProductExistInAuction(_auctionData.ProductTypes, En.ProductTypeId.Block) == true) {
                    currentView.MinimumQuantityFieldsGroup.hide();
                    currentView.MinimumQuantityIncrementFieldsGroup.hide();
                    currentView.WholesaleMinimumQuantityColumn.hide();

                }

                if (auctionData.AuctionTypeId == En.AuctionTypeId.TargetPrice || auctionData.AuctionTypeId == En.AuctionTypeId.WholesaleTargetPrice) {
                    currentView.SupplierTargetPriceDisplayColumn.show();
                    currentView.SupplierTargetPriceDisplayColumn.html('');

                    var genericWidget = currentView.$el.find("#genericWidgetTemplate").html();
                    genericWidget = genericWidget.replace(/{widgetDescription}/g, "Target Price")
                    genericWidget = genericWidget.replace(/{widgetContent}/g, auctionData.TargetPrice === null ? Const.NOT_SPECIFIED_ACRONYM : Fm.formatPrice(auctionData.TargetPrice, Const.MONEY_SYMBOL, auctionData.FeeUsageUnit));
                    currentView.SupplierTargetPriceDisplayColumn.append(genericWidget);
                }
                else {
                    currentView.SupplierTargetPriceDisplayColumn.hide();
                }

                var rfqCommodityIcon = Ih.getIconForCommodity(5, auctionData.Deal.CommodityTypeId, auctionData.Deal.CommodityTypeName);

                var iconHtml = "";
                if (auctionData.AuctionDirectionId == En.AuctionDirectionId.Forward) {
                    iconHtml = "<span>{0}{1}</span>";
                } else {
                    iconHtml = "<span>{0}</span>";
                }
                if (auctionData.AuctionDirectionId == En.AuctionDirectionId.Forward) {
                    iconHtml = String.format(iconHtml, Ih.getIconForRFQType(2, auctionData.AuctionTypeId, auctionData.AuctionTypeName), Ih.getIconForRFQDirection(2, auctionData.AuctionDirectionId));
                    var strIndex = iconHtml.lastIndexOf("<div ") + 5;
                    var iconHtml = iconHtml.slice(0, strIndex) + "style='font-size:2em; position: absolute; display: inline-block;' " + iconHtml.slice(strIndex);
                    var iconHtml = iconHtml.slice(0, strIndex - 6) + " style='display: -webkit-inline-box; ' " + iconHtml.slice(strIndex - 6);
                } else {
                    iconHtml = String.format(iconHtml, Ih.getIconForRFQType(2, auctionData.AuctionTypeId, auctionData.AuctionTypeName));
                }
                currentView.AuctionTypeIcon.html(iconHtml);
                currentView.AuctionTypeIcon.find('div').first().toggleClass("fa-5x", "fa-2x");
                currentView.RFQCommodityIcon.html(rfqCommodityIcon);
                currentView.AuctionTitle.append(String.format("<h1>RFQ #{0} - {1}</h1>", auctionData.Number, auctionData.Name));
                currentView.AuctionStatus.find("h3").html(String.format("<i class='fa fa-clock-o' aria-hidden='true'></i>&nbsp&nbsp{0}", auctionData.Status));

                //Fill contract info
                currentView.ContractStartDateColumn.html(Fm.formatDate(Ut.getMomentDateFromServer(auctionData.Deal.StartDate)));
                currentView.ContractCommodityTypeColumn.html(auctionData.Deal.CommodityTypeName);
                currentView.ContractCountryColumn.html(auctionData.Deal.CountryName);
                currentView.ContractStateColumn.html(auctionData.Deal.StateName);

                if (auctionData.UtilitiesWhenEditing != null) {
                    var utilitiesList = '';
                    for (var i = 0; i < auctionData.UtilitiesWhenEditing.length; i++) {
                        var utility = auctionData.UtilitiesWhenEditing[i];
                        if (i === 0) {
                            utilitiesList += utility.Name;
                        } else {
                            utilitiesList += String.format(", {0}", utility.Name);
                        }
                    }
                }

                if (Rh.shouldShowStopButton(_auctionData.CanEnd, _auctionData.StatusId, _auctionData.ProposedEndTime) === true) {
                    currentView.EndAuctionBtn.show();
                }
                else {
                    var pieSpan = currentView.$el.find("span[name='remainingTimePieChart']");
                    var textSpan = currentView.$el.find("p[name='remainingTimeMessage']");

                    Rh.triggerRFQRemainingTimeMessage(pieSpan, textSpan, _auctionData.EncryptedId, _auctionData.ActualStartTime, _auctionData.ProposedEndTime, 32);

                    currentView.RemainingTimeMessage.show();
                    currentView.RemainingTimeMessage.attr('style', 'float:left');
                    currentView.ExtendRFQ.attr('style', 'margin: 13px 0px 0px 5px');


                }

                currentView.ContractUtilitiesColumn.html(utilitiesList);
                currentView.ContractMinimumBandwidthColumn.html(auctionData.Deal.MinBandwidth);

                Fm.showStringOrDefaultValue(auctionData.DeliveryPoint, Const.NOT_SPECIFIED_ACRONYM, currentView.ContractDeliveryPointColumn);

                currentView.ContractProcurementAmountColumn.html(auctionData.Deal.FormattedProcurementAmount);

                currentView.ContractBrokerFeeColumn.html(Fm.formatPrice(auctionData.Fee, Const.MONEY_SYMBOL, auctionData.FeeUsageUnit));
                currentView.ContractNumberOfMetersColumn.html(auctionData.Deal.NumberOfMeters);
                currentView.ContractTermsColumn.html(auctionData.Deal.TermsList);
                currentView.ContractRenewableContentRequirementColumn.html(auctionData.Deal.RenewContReq);

                var gasPriceAssumptionValue = auctionData.GasPriceAssumption;
                if (gasPriceAssumptionValue === null || gasPriceAssumptionValue === 0 || gasPriceAssumptionValue === "0") {
                    currentView.ContractGasPriceAssumptionColumn.html(Const.NOT_SPECIFIED_ACRONYM);
                } else {
                    currentView.ContractGasPriceAssumptionColumn.html(Fm.formatPrice(gasPriceAssumptionValue, Const.MONEY_SYMBOL, "MMBTU"));
                }
                currentView.ContractPaymentTermColumn.html(auctionData.Deal.CreditTerms);
                currentView.ContractBillTypeColumn.html(auctionData.Deal.BillTypeName);

                _refreshCreditStatusInputs(currentView);

                //Fill Meters info
                currentView.MetersGridInstance = Gh.createGridForAjax(currentView.MetersGrid, String.format('/api/rfqs/{0}/meters/list',
                    currentView.options.encryptedAuctionId),
                    [
                        {
                            data: "UtilityName", orderable: false
                        },
                        {
                            data: "AccountNumber", orderable: false
                        },
                        {
                            data: "MeterNumber", orderable: false
                        },
                        {
                            data: "FormattedAddress", orderable: false
                        }
                    ],
                    {
                        searching: false,
                        destroy: true,
                        info: false,
                        emptyTableMessage: 'There are no meters to show',
                        effectiveGridFinishedRenderingEventHandler: function () {

                        }
                    });

                //Fill contact info
                //if (App.isLoggedUserASupplier() == true && auctionData.Contact.Id == Const.INVALID_ID) {
                //    currentView.$el.find("a[href='#contactInfo']").closest('li').remove();
                //    currentView.$el.find("#contactInfo").remove();
                //} else {
                //    currentView.ContactFirstNameColumn.html(auctionData.Contact.FirstName);
                //    currentView.ContactLastNameColumn.html(auctionData.Contact.LastName);
                //    currentView.ContactJobTitleColumn.html(auctionData.Contact.JobTitle);
                //    currentView.ContactPhoneColumn.html(auctionData.Contact.Phone);
                //    currentView.ContactEmailColumn.html(auctionData.Contact.Email);
                //    if (!App.isLoggedUserASupplier() && !App.isLoggedUserAnCustomer() && !App.isLoggedUserAnPartner() && !App.isLoggedRFQViewerOnlyUser()) {

                //        currentView.$el.find('#InviteCustomerRow').show();
                //        currentView.InviteCustomerColumn.html("<a name='inviteCustomerBtn'  data-toggle='tooltip' title='Send Customer Invitation' class='btn btn-success'><i class='uil uil-envelope-alt' aria-hidden='true'></i></a >");
                //    }
                //}




                //Fill Customer info
                currentView.CustomerNameColumn.html(Fm.formatString(auctionData.Account.Name));
                Fm.showStringOrDefaultValue(auctionData.Account.Address, Const.NOT_SPECIFIED_ACRONYM, currentView.CustomerAddressColumn);
                Fm.showStringOrDefaultValue(auctionData.Account.City, Const.NOT_SPECIFIED_ACRONYM, currentView.CustomerCityColumn);
                Fm.showStringOrDefaultValue(auctionData.Account.StateName, Const.NOT_SPECIFIED_ACRONYM, currentView.CustomerStateColumn);
                currentView.CustomerCountryColumn.html(auctionData.Account.CountryName);
                Fm.showStringOrDefaultValue(auctionData.Account.PostalCode, Const.NOT_SPECIFIED_ACRONYM, currentView.CustomerPostalCodeColumn);
                Fm.showStringOrDefaultValue(auctionData.Account.DUNS, Const.NOT_SPECIFIED_ACRONYM, currentView.CustomerDUNSColumn);
                Fm.showStringOrDefaultValue(auctionData.Account.TaxID, Const.NOT_SPECIFIED_ACRONYM, currentView.CustomerTaxIdColumn);
                Fm.showStringOrDefaultValue(auctionData.Account.AccountLegalName, Const.NOT_SPECIFIED_ACRONYM, currentView.CustomerAccountLegalNameColumn);

                _uploadedFiles = auctionData.Attachments;

                if (App.isLoggedUserAnCustomer() || App.isLoggedUserAnPartner()) {
                    $("th").filter(function () {
                        if ($(this).text() === "Description") {
                            return $(this);
                        }
                    }).remove();
                    $("#auctionDescriptionColumn").remove();
                    $("th").filter(function () {
                        if ($(this).text() === "Access") {
                            return $(this);
                        }
                    }).remove();
                    $("#auctionAccessTypeColumn").remove();
                    $("th").filter(function () {
                        if ($(this).text() === "Chat") {
                            return $(this);
                        }
                    }).remove();
                    $("#auctionChatSettingsColumn").remove();
                    currentView.options.removeCommentsColumn = true;
                    //$("th").filter(function () {
                    //    if ($(this).text() === "Comments") {
                    //        return $(this);
                    //    }
                    //}).remove();
                    $("#auctionPriceCommentsColumn").remove();
                }

                if (App.isLoggedUserAnCustomer() && _auctionData.HideBrokerFee) {
                    $("#brokerFeeColumn").remove();
                    $("#contractBrokerFeeColumn").remove();
                }

                if (auctionData.AuctionTypeId !== En.AuctionTypeId.OpenBid && _auctionData.AuctionTypeId !== En.AuctionTypeId.WholesaleOpen) {
                    currentView.$el.find("#bidsGraph li > a[href='#lowestPricesGraphTab']").remove();
                    currentView.$el.find("#lowestPricesGraphTab").remove();
                }

                if ((_auctionData.IsWholesale === false && _auctionData.AuctionDirectionId != En.AuctionDirectionId.Forward) || (_auctionData.IsWholesale === true && _checkIfAProductExistInAuction(_auctionData.ProductTypes, En.ProductTypeId.Block) == true)) {
                    currentView.$el.find("#bidsGraph li > a[href='#bidStackGraphTab']").remove();
                    currentView.$el.find("#bidStackGraphTab").remove();

                    currentView.$el.find("#bidsGraph li > a[href='#WAPGraphTab']").remove();
                    currentView.$el.find("#WAPGraphTab").remove();
                }

                var productTypesLength = auctionData.ProductTypes.length;

                if (productTypesLength < 2) {
                    currentView.$el.find('#generalProductTypeSelector').hide();
                    currentView.$el.find('#biddingColumnProductTypeSelector').hide();
                    if (App.isLoggedUserASupplier() === true) {
                        currentView.$el.find('#conditionalDiv').hide();
                    }
                } else {
                    currentView.$el.find('#conditionalDiv').show();
                    if (App.isLoggedUserASupplier() === true) {
                        $("#biddingColumnProductTypeSelector").attr("style", "padding: 0px 15px 7px 15px; border-style: none;");
                    }
                }

                if (productTypesLength == 1 && App.isLoggedUserASupplier() === false) {
                    currentView.$el.find('#generalProductTypeSelector').show();
                    $("#generalProductTypeSelector span").hide();
                    $("#generalProductTypeSelector select").hide();
                    var row = document.createElement("row");
                    $("#generalProductTypeSelector span").appendTo(row);
                    $("#generalProductTypeSelector select").appendTo(row);
                    $("#generalProductTypeSelector").parent().prepend(row);
                    var currentText = $("#generalProductTypeSelector").text();
                    $("#generalProductTypeSelector").text(currentText.replace("Pricing for", "Pricing for " + auctionData.ProductTypes[0].DisplayName));
                }

                currentView.CurrentProductTypeDDL.empty();
                for (var i = 0; i < productTypesLength; i++) {
                    Sh.addOption(currentView.CurrentProductTypeDDL,
                        auctionData.ProductTypes[i].Id,
                        auctionData.ProductTypes[i].DisplayName);
                }

                //We initialize the product type description and starting price field
                var initialProductType = _getCurrentProductTypeObject(currentView);
                currentView.ContractProductTypeDescriptionColumn.html(!initialProductType.ProductTypeDescription ? Const.NOT_SPECIFIED_ACRONYM : initialProductType.ProductTypeDescription);

                Fm.formatPriceBasedOnProductType(initialProductType.ProductType.Id, initialProductType, Const.MONEY_SYMBOL, _auctionData.FeeUsageUnit, function (formattedValue) {
                    if (formattedValue.includes("Hedge")) {
                        formattedValue = formattedValue.split(", Hedge")[0];
                    }
                    var formattedStartingPrice = Fm.formatString(formattedValue);
                    currentView.AuctionStartingPriceColumn.html(formattedStartingPrice);

                    if (_auctionData.CanBid === true) {
                        // Show starting price for initially-selected product type
                        if (formattedStartingPrice != null &&
                            formattedStartingPrice != Const.NOT_SPECIFIED_ACRONYM) {
                            currentView.StartingPriceValue.html(formattedStartingPrice);
                            currentView.StartingPriceFieldsGroup.removeClass("visibilityNone");
                        }
                    }

                    currentView.bidsGridInstance = new AuctionBidsGridView();
                    currentView.bidsGridInstance.options.auctionData = _auctionData;
                    if (App.isLoggedUserASupplier() === false) {
                        currentView.bidsGridInstance.options.rfqProductId = _getCurrentProductTypeObject(currentView).Id;

                        if (_auctionData.AuctionTypeId == En.AuctionTypeId.SealedBid) {
                            currentView.bidsGridInstance.options.startingFilter = En.BidListingFilters.Active;
                        }
                    }
                    currentView.bidsGridInstance.direction = _auctionData.AuctionDirectionId;
                    currentView.BidsGridContainer.html(currentView.bidsGridInstance.render().el);
                    _refreshBidHistoryGrid(currentView);

                });

                _showHideFieldsForCommodityType(_auctionData.Deal.CommodityTypeId, currentView);
            }

            if (_checkIfAProductExistInAuction(_auctionData.ProductTypes, En.ProductTypeId.Block) && _auctionData.IsWholesale) {
                currentView.GasPriceAssumptionColumn.show();
                currentView.PaymentTermColumn.show();
                currentView.ContractProcurementAmountColumn.show();
                currentView.TotalQuantitySought.hide();
            }


        }

        var _currentProductTypeChanged = function (currentView) {
            var currentProductType = _getCurrentProductTypeObject(currentView);
            currentView.ContractProductTypeDescriptionColumn.html(!currentProductType.ProductTypeDescription ? Const.NOT_SPECIFIED_ACRONYM : currentProductType.ProductTypeDescription);

            Fm.formatPriceBasedOnProductType(currentProductType.ProductType.Id, currentProductType, Const.MONEY_SYMBOL, _auctionData.FeeUsageUnit, function (formattedValue) {
                if (formattedValue.includes("Hedge")) {
                    formattedValue = formattedValue.split(", Hedge")[0];
                }
                var formattedStartingPrice = Fm.formatString(formattedValue);

                currentView.AuctionStartingPriceColumn.html(formattedStartingPrice);

                if (_auctionData.CanBid === true) {
                    // I need to refresh starting price
                    if (formattedStartingPrice != null &&
                        formattedStartingPrice != Const.NOT_SPECIFIED_ACRONYM) {
                        currentView.StartingPriceValue.html(formattedStartingPrice);
                        currentView.StartingPriceFieldsGroup.removeClass("visibilityNone");
                    }
                    else {
                        currentView.StartingPriceValue.html('');
                        currentView.StartingPriceFieldsGroup.addClass("visibilityNone");
                    }

                    // I need to render again the bidding column
                    _showBiddingPanel(currentView, true, _auctionData);

                    if (currentView.IsBidBehalfOnSupplier === true) {
                        _recalculateSavings(currentView);
                        _refreshBidHistoryGrid(currentView);
                    }
                }
                else {
                    // I need to refresh bid data
                    if (currentView.isRefreshChartRequest === true) {
                        _refreshBiddingChart(currentView);
                    }
                    _recalculateSavings(currentView);
                    _refreshBidHistoryGrid(currentView);
                }
            });
        }

        var _getCurrentProductTypeObject = function (currentView) {
            var currentProductTypeId = '';
            if (currentView.isRefreshChartRequest === true) {
                currentProductTypeId = $("#bidsGraph").find("#currentProductTypeDDL").val();
            }
            else {
                currentProductTypeId = currentView.CurrentProductTypeDDL.val();
            }
            return _.find(_auctionData.ProductTypes, function (item) {
                return item.Id == currentProductTypeId
            });
        }

        var _updateCurrentPrices = function (currentView) {
            if (_getUpdateCurrentPricesExecutionLock === false) {
                _getUpdateCurrentPricesExecutionLock = true;

                var findTermInResponse = function (CurrentPricesData, termNumber) {
                    for (var i = 0; i < CurrentPricesData.length; i++) {
                        if (CurrentPricesData[i].Term == termNumber) {
                            return CurrentPricesData[i];
                        }
                    }

                    return null;
                }

                if (App.isLoggedUserASupplier() === true) {
                    var loadingPanel = currentView.$el.find("#biddingColumnLoadingPanel");
                    loadingPanel.show();
                    Ah.doAjaxRequest('GET', String.format('/api/rfqs/{0}/bid/{1}/{2}', currentView.options.encryptedAuctionId,
                        currentView.options.AuctionTypeId == En.AuctionTypeId.OpenBid || currentView.options.AuctionTypeId == En.AuctionTypeId.WholesaleOpen ? "winners" : "latest",
                        _getCurrentProductTypeObject(currentView).Id),
                        null,
                        function (responseData) {

                            var tableBody = currentView.SubmitBidGrid.find("tbody");
                            var pricesHidden = _auctionData.FirstBidBlind === true && responseData.SupplierHasAtLeastOneBid === false;

                            for (var i = 0; i < _splittedTerms.length; i++) {
                                var currentTerm = _splittedTerms[i];
                                // we find the correct row
                                var currentTermRow = tableBody.find(String.format("[data-term='{0}']", currentTerm));

                                var currentPriceWinnerSpan = currentTermRow.find("[name='currentPriceWinner']");
                                var currentPriceWinnerCell = currentPriceWinnerSpan.closest('td');

                                var currentPrice = '- No quotes for this term -';

                                if (pricesHidden) {
                                    currentPriceWinnerSpan.html('$X.XXXXX </br>  You must submit at least one quote in order to view the current low quote.');
                                }
                                else {
                                    var bidOnResponse = findTermInResponse(responseData.CurrentPricesData, currentTerm);
                                    var showEffectivePrice = _.contains(_complexProductTypeIds, _getCurrentProductTypeObject(currentView).ProductType.Id);
                                    if (bidOnResponse != null) {
                                        // found a bid
                                        currentPrice = bidOnResponse.HumanizedFormatWithoutTerm.replace(/,\s*/, ",<br />");

                                        if (showEffectivePrice === true) {
                                            currentPrice += String.format("<br />Effective Price: {0}", bidOnResponse.FormattedEffectivePrice);
                                        }

                                        if (_auctionData.AuctionTypeCanSeeOtherPeopleBids === true) {
                                            if (bidOnResponse.DoesItBelongToCaller === true) {
                                                currentPriceWinnerCell.addClass('bg-primary');
                                            }
                                            else {
                                                currentPriceWinnerCell.removeClass('bg-primary');
                                            }
                                        }
                                    }
                                    currentPriceWinnerSpan.html(currentPrice);

                                    if ((_auctionData.AuctionTypeId == En.AuctionTypeId.OpenBid || _auctionData.AuctionTypeId == En.AuctionTypeId.WholesaleOpen) &&
                                        (_getCurrentProductTypeObject(currentView).ProductType.UseQuantity === true)) {

                                        currentView.SupplierWAPDisplayColumn.show();
                                        currentView.SupplierWAPDisplayColumn.html('');

                                        var genericWidget = currentView.$el.find("#genericWidgetTemplate").html();
                                        genericWidget = genericWidget.replace(/{widgetDescription}/g, "WAP")
                                        genericWidget = genericWidget.replace(/{widgetContent}/g, Fm.formatPrice(responseData.WeightedAveragePrice, Const.MONEY_SYMBOL, null, 5));
                                        currentView.SupplierWAPDisplayColumn.append(genericWidget);
                                    }
                                    else {
                                        currentView.SupplierWAPDisplayColumn.hide();
                                    }
                                }

                            }
                        },
                        null,
                        function () {
                            loadingPanel.hide();
                            _getUpdateCurrentPricesExecutionLock = false;
                        }, false);
                }
            }
        };

        return {
            template: CM.HtmlTemplates.AuctionBidViewTemplate({
                GuidelinesModalTemplatePlaceholder: CM.HtmlTemplates.GuidelinesModalTemplate(),
                QandAModalTemplatePlaceholder: CM.HtmlTemplates.QandAModalTemplate(),
                RFQBidControlsTemplatePlaceholder: CM.HtmlTemplates.RFQBidControlsTemplate(),
                LoadingSpinnerPlaceholder: CM.HtmlTemplates.LoadingSpinnerTemplate,
                DeclineBidModalTemplatePlaceholder: CM.HtmlTemplates.DeclineBidTemplate
            }),
            events: {
                "ifChanged input[name='chkCurrentSupplier']": "contactCheckChangedForMessage",
                "click button[name='bidBtn']": "confirmBid",
                "click button[name='bidAllBtn']": "confirmMultipleBids",
                "click input[name='termSelect']": "refreshGraphsForTerm",
                "click a[name='deleteSupplierBtn']": 'removeSupplier',
                "click button[name='addSuppliersBtn']": 'addSuppliers',
                "click [name='endAuctionBtn']": "endRFQ",
                "ifChanged input[name='chkContact']": "updateAddSuppliersButton",
                "click a[name='resendInviteBtn']": "resendSupplierInvite",
                "click button[name='updateSupplierCreditStatusBtn']": "updateSupplierCreditStatus",
                "click button[name='submitSupplierMessageBtn']": "sendSupplierMessage",
                "change input[type=radio][name=message-suppliers]": "messageSuppliersToggle",
                "click [name='ExtendRFQ']": "extendsRFQ",
                "click a[name='excelBtn']": "exportRfqToExcel",
                "click .collapsible": "collapse",
                //CM-11825
                "click button[name='submitDeclineBidDescriptionBtn']": "submitDeclineBidDescription"
            },
            initialize: function () {
                this.title = "RFQ Pricing";
                this.menuItemToMarkAsActive = '/rfqs/Grid';
                this.termSelected = null;
                this.options = {
                    removeCommentsColumn: false
                };
                this.selectedUsers = [];
                this.selectedOnlyMessageSuppliers = false;
                this.IsBidBehalfOnSupplier = App.isLoggedUserABrokerUser() === true && App.isLoggedUserASupplier() === false ? true : false;
                this.isRefreshChartRequest = false;
            },
            render: function () {
                var currentView = this;

                this.$el.html(this.template);

                //Customer Info
                this.CustomerNameColumn = this.$el.find("#customerNameColumn");
                this.CustomerAddressColumn = this.$el.find("#customerAddressColumn");
                this.CustomerCityColumn = this.$el.find("#customerCityColumn");
                this.CustomerStateColumn = this.$el.find("#customerStateColumn");
                this.CustomerCountryColumn = this.$el.find("#customerCountryColumn");
                this.CustomerPostalCodeColumn = this.$el.find("#customerPostalCodeColumn");
                this.CustomerTaxIdColumn = this.$el.find("#customerTaxIdColumn");
                this.CustomerDUNSColumn = this.$el.find("#customerDUNSColumn");
                this.CustomerAccountLegalNameColumn = this.$el.find("#customerAccountLegalNameColumn");

                //Contact Info
                //this.ContactFirstNameColumn = this.$el.find("#contactFirstNameColumn");
                //this.ContactLastNameColumn = this.$el.find("#contactLastNameColumn");
                //this.ContactJobTitleColumn = this.$el.find("#contactJobTitleColumn");
                //this.ContactPhoneColumn = this.$el.find("#contactPhoneColumn");
                //this.ContactEmailColumn = this.$el.find("#contactEmailColumn");
                //this.InviteCustomerColumn = this.$el.find("#inviteCustomerColumn");

                //Contacts Grid
                this.ContactsGridRow = this.$el.find("#contactInfo");
                this.ContactsGridViewInstance = new ContactsGridView();
                this.ContactsGridViewInstance.options.isCustomerView = false;
                this.ContactsGridViewInstance.options.encryptedEntityId = this.options.encryptedAuctionId;
                this.ContactsGridViewInstance.options.entity = "RFQ";
                this.ContactsGridViewInstance.options.showEntityInviteButton = true;
                this.ContactsGridRow.html(this.ContactsGridViewInstance.render().el);

                //Contract Info
                this.RetailContractInfoTable = currentView.$el.find("#retailContractInfoTable");
                this.ContractStartDateColumn = this.$el.find("#contractStartDateColumn");
                this.ContractCommodityTypeColumn = this.$el.find("#contractCommodityTypeColumn");
                this.ContractCountryColumn = this.$el.find("#contractCountryColumn");
                this.ContractStateColumn = this.$el.find('#contractStateColumn');
                this.ContractUtilitiesColumn = this.$el.find('#contractUtilitiesColumn');
                this.ContractMinimumBandwidthColumn = this.$el.find('#contractMinimumBandwidthColumn');
                this.ContractDeliveryPointColumn = this.$el.find('#contractDeliveryPointColumn');
                this.ContractProcurementAmountColumn = this.$el.find("#contractProcurementAmountColumn");
                this.ContractProcurementAmountColumns = this.$el.find("[name='contractProcurementAmountColumn']");
                this.ContractBrokerFeeColumn = this.$el.find("#contractBrokerFeeColumn");
                this.ContractBrokerFeeColumnGroup = this.$el.find("[name='brokerFeeColumn']");
                this.ContractNumberOfMetersColumn = this.$el.find("#contractNumberOfMetersColumn");
                this.ContractTermsColumn = this.$el.find("#contractTermsColumn");
                this.ContractRenewableContentRequirementColumn = this.$el.find("#contractRenewableContentRequirementColumn");
                this.ContractRenewableContentRequirementColumns = this.$el.find("[name='contractRenewableContentRequirementColumn']");
                this.ContractGasPriceAssumptionColumn = currentView.$el.find("#contractGasPriceAssumptionColumn");
                this.ContractProductTypeDescriptionColumn = this.$el.find("#contractProductTypeDescriptionColumn");
                this.ContractPaymentTermColumn = this.$el.find("#contractPaymentTermColumn");
                this.ContractBillTypeColumn = this.$el.find("#contractBillTypeColumn");
                this.GasPriceAssumptionColumn = this.$el.find("[name='gasPriceAssumptionColumn']");
                this.PaymentTermColumn = this.$el.find("[name='paymentTermColumn']");
                this.TotalQuantitySought = this.$el.find("[name='totalQuantitySought']");

                this.WholesaleContractInfoTable = this.$el.find("#wholesaleContractInfoTable");
                this.WholesaleTotalQuantitySoughtColumn = this.$el.find("#contractTotalQuantitySoughtColumn");

                //Meters Info
                this.MetersGrid = this.$el.find("#metersGrid");

                //RFQ Details
                this.RetailRFQDetailsTable = this.$el.find("#retailRFQDetailsTable");
                this.AuctionTypeColumn = this.$el.find("#auctionTypeColumn");
                this.AuctionNameColumn = this.$el.find("#auctionNameColumn");
                this.AuctionStartTimeColumn = this.$el.find("#auctionStartTimeColumn");
                this.AuctionEndTimeFieldsGroup = this.$el.find("[name='auctionEndTime']");
                this.AuctionEndTimeColumn = this.$el.find("#auctionEndTimeColumn");
                this.AuctionExtendRow = this.$el.find("#extendAuctionRow");
                this.AuctionExtendColumn = this.$el.find('#extendAuctionColumn');
                // this.AuctionEndPicker = this.$el.find("#auctionEndPicker");
                this.AuctionBenchmarkPriceColumn = this.$el.find("#auctionBenchmarkPriceColumn");
                this.AuctionReservePriceColumn = this.$el.find("#auctionReservePriceColumn");
                //    this.AuctionProposedEndTimeInput = this.$el.find("#auctionEndPicker").find("input");
                //this.AuctionEndPicker.datetimepicker({
                //    sideBySide: true,
                //});
                this.AuctionStartingPriceColumn = this.$el.find("#auctionStartingPriceColumn");
                this.AuctionTargetPriceColumn = this.$el.find("#auctionTargetPriceColumn");
                this.AuctionNumberColumn = this.$el.find("#auctionNumberColumn");

                this.showGuidelinesBtn = this.$el.find("#showGuidelinesBtn");
                this.showQABtn = this.$el.find("#showQABtn");

                this.AuctionQAndAModalBodyContainer = this.$el.find("#qAndAModal").find(".modal-body p");
                this.AuctionGuidelinesModalBodyContainer = this.$el.find("#guidelinesModal").find(".modal-body p");

                this.AuctionAccessTypeColumn = this.$el.find('#auctionAccessTypeColumn');
                this.AuctionChatSettingsColumn = this.$el.find('#auctionChatSettingsColumn');
                this.AuctionPriceCommentsColumn = this.$el.find('#auctionPriceCommentsColumn');
                this.AuctionDescriptionColumn = this.$el.find('#auctionDescriptionColumn');

                this.WholesaleRFQDetailsTable = this.$el.find("#wholesaleRFQDetailsTable");
                this.WholesaleMinimumQuantityColumn = this.$el.find("#wholesaleMinimumQuantityColumn");
                this.WholesaleTargetPriceColumn = this.$el.find("#wholesaleTargetPriceColumn");
                this.AuctionTypeIcon = this.$el.find("#auctionTypeIcon");
                this.RFQCommodityIcon = this.$el.find("#rfqCommodityIcon");
                this.AuctionTitle = this.$el.find("#RFQTitle");
                this.AuctionStatus = this.$el.find("#RFQStatus");
                this.QuoteSummaryPanel = this.$el.find("#quoteSummaryPanel");
                this.LowPriceWidget = this.$el.find("#lowPriceWidget");
                this.LowSupplierWidget = this.$el.find("#lowSupplierWidget");
                this.StartAuctionBtn = this.$el.find("[name='startAuctionBtn']");
                this.EndAuctionBtn = this.$el.find("[name='endAuctionBtn']");

                this.ChartContainer = this.$el.find("#chart");
                this.AuctionHasNotStartedYetContainer = this.$el.find("#auctionNotStartedYet");
                this.AuctionAlreadyFinishedContainer = this.$el.find("#auctionAlreadyFinished");
                this.AuctionHasStartedContainer = this.$el.find("#auctionStartedContainer");
                this.AuctionNoPermissions = this.$el.find("#auctionNoPermissions");
                this.AuctionHasNotStartedScheduleMessage = currentView.AuctionHasNotStartedYetContainer.find("#auctionSchedule");
                this.BiddingControlsColumn = this.$el.find("#biddingColumn");
                this.SupplierWAPDisplayColumn = this.$el.find("#supplierWAPDisplayColumn");
                this.SupplierTargetPriceDisplayColumn = this.$el.find("#supplierTargetPriceDisplayColumn");
                this.BidAllButton = this.$el.find("#bidAllBtn");
                this.BidTypeTableHeader = this.$el.find('#bidTypeTableHeader');
                this.BiddingControlsFooter = this.BiddingControlsColumn.find("tfoot");
                this.BidsGraphColumn = this.$el.find("#bidsGraph");
                this.BidHistoryGrid = this.$el.find("#grid");
                this.RemainingTimeMessage = this.$el.find("#remainingTimeMessage");
                this.SuppliersTab = this.$el.find("[href='#suppliers']");
                this.QuoteSubmissionTab = this.$el.find("[href='#quoteSubmission']");

                this.DocumentsModal = this.$el.find("#documentsModal");
                this.DocumentsModalBodyContainer = this.DocumentsModal.find(".modal-body");
                this.FileUploadContainer = this.$el.find("#fileUploadContainer");

                this.BidsHistoryGridLoadingPanel = this.$el.find("#bidsHistoryGridLoadingPanel");
                this.BidsGraphLoadingPanel = this.$el.find("#bidsGraphLoadingPanel");
                this.BidsGridContainer = this.$el.find("#bidsGridContainer");
                this.PricesDistributionGraphContainer = this.$el.find("#pricesDistributionGraphContainer");
                this.LowestPricesGraphContainer = this.$el.find("#lowestPricesGraphContainer");
                this.LowestBidsGraphToggleButton = this.$el.find('#lowestBidsGraphSelectButton');
                this.BidStackGraphContainer = this.$el.find("#bidStackGraphContainer");
                this.WAPGraphContainer = this.$el.find("#WAPGraphContainer");
                this.AllBidsGraphToggleButton = this.$el.find('#allBidsGraphSelectButton');
                this.SubmitBidGrid = this.BiddingControlsColumn.find("table");

                this.WidgetsRow = this.$el.find('#widgetsRow');
                this.SupplierWidgets = this.$el.find('.supplierInfoWidget');
                this.SavingsVsBenchmark = this.$el.find('#savingsVsBenchmark');
                this.SavingsVsReserve = this.$el.find('#savingsVsReserve');
                this.SavingsVsTarget = this.$el.find('#savingsVsTarget');
                this.TotalBidsReceived = this.$el.find("#totalBidsReceived");
                this.TotalUniqueBidders = this.$el.find("#totalUniqueBidders");
                this.CurrentLowPrice = this.$el.find("#currentLowPrice");
                this.CurrentLowSupplier = this.$el.find("#currentLowSupplier");
                this.LowSupplierLogo = this.$el.find("#lowSupplierLogo");

                this.InvitationStatusesGrid = this.$el.find('#invitationStatuses');
                this.MessageSuppliersGrid = this.$el.find('#invitationMessageStatuses');
                this.MessageSuppliersDiv = this.$el.find('#messageInvitationSuppliers');
                this.Wizard = this.$el.find('#tabWizard');
                this.DeliveryPointColumn = this.$el.find("[name='deliveryPointColumn']");
                this.NumberOfMetersColumn = this.$el.find("[name='numberOfMetersColumn']");

                this.GraphWizard = this.$el.find('#graphTabsWizard');

                this.MetersTab = this.$el.find("a[href='#meters']");

                _setCurrentProductTypeDDLReference(currentView);

                Ut.buildDDLWithoutAjax(this.CurrentProductTypeDDL, null, true);

                this.StartingPriceValue = this.$el.find("#startingPriceValue");
                this.StartingPriceFieldsGroup = this.$el.find("#startingPriceFieldsGroup");

                this.MinimumQuantityValue = this.$el.find("#minimumQuantityValue");
                this.MinimumQuantityFieldsGroup = this.$el.find("#minimumQuantityFieldsGroup");
                this.MinimumQuantityIncrementValue = this.$el.find("#minimumQuantityIncrementValue");
                this.MinimumQuantityIncrementFieldsGroup = this.$el.find("#minimumQuantityIncrementFieldsGroup");

                this.BulkSupplierMessageInput = this.$el.find("#bulkSupplierMessage");
                this.BulkSupplierCopySenderToggle = this.$el.find("#bulkSupplierMessageCopySender");
                this.SubmitSupplierMessageBtn = this.$el.find("[name='submitSupplierMessageBtn']");

                //Supplier Credit Statuses
                this.SupplierCreditStatusesRow = this.$el.find("#supplierCreditStatusesRow");
                this.CurrentSupplierCreditStatusRow = this.$el.find("#currentSupplierCreditStatusRow");
                this.SupplierCreditStatusesGrid = this.$el.find("#supplierCreditStatusesGrid");
                this.UpdateSupplierCreditStatusForm = this.$el.find("#updateSupplierCreditStatusForm");
                this.UpdateSupplierCreditStatusBtn = this.$el.find("[name='updateSupplierCreditStatusBtn']");
                this.CreditStatusesDDL = this.$el.find("#creditStatusesDDL");
                this.CreditStatusComments = this.$el.find("#creditStatusComments");
                this.DepositAmount = this.$el.find("#depositAmount");
                this.ExportRow = this.$el.find("#exportRow");
                this.InvitedSupplierCompaniesDDL = this.$el.find("#invitedSupplierCompaniesDDL");
                this.SupplierCompanySelector = this.$el.find("#supplierCompanySelector");
                this.QuoteSubmissionPanel = this.$el.find("#quoteSubmission");
                this.SubmitBidGridForBroker = this.QuoteSubmissionPanel.find("table");
                this.RFQDetailsTab = this.$el.find("[href='#transactionDetails']");
                this.ExtendRFQ = this.$el.find("[name='ExtendRFQ']");


                this.BidDeclineDescriptionDDL = this.$el.find("#bidDeclineDescriptionDDL");
                this.DeclineBidFormContainer = this.$el.find("#declineBidFormContainer");
                this.DeclineBidForm = this.DeclineBidFormContainer.find("form");

                this.BidDeclineDescription = this.$el.find("#bidDeclineDescription");

                this.BidDeclineDescriptionDDL.on('change', function () {
                    if (currentView.BidDeclineDescriptionDDL.val() == "Other") {
                        currentView.BidDeclineDescription.show();
                    }
                    else {
                        currentView.BidDeclineDescription.hide();
                    }
                });


                if (App.isLoggedUserASupplier() === true) {
                    this.ExportRow.show();
                    currentView.$el.find('#SupplierCompanySelector').hide();
                }

                if (App.isLoggedUserASupplier() === true || App.isLoggedUserAnCustomer() === true || App.isLoggedUserAnPartner() === true) {
                    currentView.$el.find("a[href='#quoteSubmission']").remove();
                    currentView.QuoteSubmissionPanel.remove();
                }

                if (App.isLoggedUserABrokerUser() === true) {
                    currentView.SupplierCompanySelector.removeClass("visibilityNone");
                }

                this.CreditStatusesDDL.on('change', function () {
                    if (currentView.UpdateSupplierCreditStatusForm.parsley().destroy != null) {
                        currentView.UpdateSupplierCreditStatusForm.parsley().destroy();
                    }

                    if (currentView.CreditStatusesDDL.val() == En.CreditStatusId.DepositRequired) {
                        currentView.DepositAmount.attr("disabled", false);
                    } else {
                        if (_previousCreditStatus == null) {
                            currentView.DepositAmount.val('');
                        }
                        else {
                            currentView.DepositAmount.val(_previousCreditStatus.DepositAmount);
                        }
                        currentView.DepositAmount.attr("disabled", "disabled");
                    }

                    if (_previousCreditStatus != null) {
                        if (currentView.CreditStatusesDDL.val() != _previousCreditStatus.StatusId) {
                            _enableUpdateCreditStatusButton(currentView);
                        } else {
                            _disableUpdateCreditStatusButton(currentView);
                        }
                    }
                });

                this.DepositAmount.on('input', function () {
                    if (_previousCreditStatus != null) {
                        if (currentView.DepositAmount.val() != _previousCreditStatus.DepositAmount) {
                            _enableUpdateCreditStatusButton(currentView);
                        } else {
                            _disableUpdateCreditStatusButton(currentView);
                        }
                    }
                });

                this.CreditStatusComments.on('input', function () {
                    if (_previousCreditStatus != null) {
                        if (currentView.CreditStatusComments.val() != _previousCreditStatus.OtherStatus) {
                            _enableUpdateCreditStatusButton(currentView);
                        } else {
                            _disableUpdateCreditStatusButton(currentView);
                        }
                    }
                });

                this.CurrentProductTypeDDL.on("change", function (sender) {

                    if (($(sender.target).data("is-bids-graph") != "undefined") && ($(sender.target).data("is-bids-graph") === true)) {
                        currentView.isRefreshChartRequest = true;
                    }
                    else {
                        currentView.isRefreshChartRequest = false;
                    }
                    _currentProductTypeChanged(currentView);
                });

                this.DocumentsModal.on('shown.bs.modal', function () {
                    currentView.documentsGridInstance = new AuctionDocumentsGridView();
                    currentView.documentsGridInstance.options = {
                        localDataSource: _uploadedFiles
                    };
                    currentView.DocumentsModalBodyContainer.html(currentView.documentsGridInstance.render().el);
                })

                this.BulkSupplierMessageInput.on('input', function () {
                    currentView.validateSupplierMesssageButton();
                });

                Ut.buildDDL(this.CreditStatusesDDL, '/api/creditStatuses', null, 'Select a Status');

                Ut.buildDDL(this.InvitedSupplierCompaniesDDL, String.format('/api/rfqs/{0}/supplierusers', currentView.options.encryptedAuctionId), null, 'Select a supplier');

                appChannel.on("auctionBidView:gettingBid", function () {
                    currentView.BidsHistoryGridLoadingPanel.show();
                    currentView.BidsGraphLoadingPanel.show();
                });

                appChannel.on("auctionBidView:finishedGettingBid", function () {
                    currentView.BidsHistoryGridLoadingPanel.hide();
                    currentView.BidsGraphLoadingPanel.hide();
                });

                _appChannel.on("auctionBidView:bidsHistoryGridLoadingStarted", function () {
                    currentView.BidsHistoryGridLoadingPanel.show();
                });

                _appChannel.on("auctionBidView:bidsHistoryGridLoadingFinished", function () {
                    currentView.BidsHistoryGridLoadingPanel.hide();
                });

                appChannel.on("auctionBidsGrid:bidDeleted", function () {
                });

                appChannel.on("auctionBidsGraph:refreshLowestBidsGraph", function () {

                });

                appChannel.on("auctionBidsGraph:refreshAllBidsGraph", function () {

                });

                appChannel.on('supplier:unauthorized', function (supplierPermission) {
                    if (!window.location.href.includes("Company/Manage")) {
                        UpgradeMembershipModalView.createNewInstance("In-app quoting is only available for paid members", false);
                    }
                });


                Ah.doAjaxRequest('GET', "/api/rfqs/" + currentView.options.encryptedAuctionId, null, function (returnValue) {
                    if (returnValue != null) {
                        if (returnValue.CanViewDetails === false) {
                            // the user doesn't have permissions to see this
                            currentView.AuctionNoPermissions.show(true);
                        }
                        else {
                            // we update the breadcrumb here
                            _setupBreadcrumbs(currentView, returnValue);

                            var auctionHasStarted = false;
                            var auctionHasFinished = false;
                            var auctionNotStartedScheduledMessage = null;

                            var finishedAuctionStatuses = [En.AuctionStatusId.Completed,
                            En.AuctionStatusId.ClosedAwarded,
                            En.AuctionStatusId.ClosedNotAwarded,
                            En.AuctionStatusId.Cancelled]

                            if (finishedAuctionStatuses.indexOf(returnValue.StatusId) === Const.INVALID_ID) {
                                // we need to determine what can this user do here in order to show/hide different things
                                if (returnValue.ActualStartTime != null) {
                                    _fillAuctionData(currentView, returnValue);

                                    // there's an start date, has it passed yet?
                                    var momentActualStartTime = Ut.getMomentDateAndTimeFromServer(returnValue.ActualStartTime);
                                    if (returnValue.StatusId != En.AuctionStatusId.Running) {
                                        // it has not started yet but we have a date
                                        auctionNotStartedScheduledMessage = String.format("The RFQ is set to start on {0}, please come back later.",
                                            Fm.formatDateAndTime(momentActualStartTime));
                                    }
                                    else {
                                        auctionHasStarted = true;

                                        if (returnValue.CanBid === true) {
                                            // this user can bid so we show the bid panel
                                            _showBiddingPanel(currentView, true, returnValue);

                                            if (currentView.IsBidBehalfOnSupplier === true) {
                                                currentView.BiddingControlsColumn.remove();
                                            }
                                        }
                                        else {
                                            currentView.BiddingControlsColumn.remove();
                                            _setCurrentProductTypeDDLReference(currentView);
                                        }

                                        if (returnValue.CanViewOtherPeopleBids === true || App.isLoggedUserAnCustomer() || App.isLoggedUserAnPartner()) {
                                            // this means the user can see ALL supplier details
                                            // so we show the graph
                                            currentView.BidsGraphColumn.show(true);
                                            var terms = returnValue.Deal.TermsList.split(',');

                                            if (terms.length > 1) {
                                                var allTermsSelector = "<div class='radio radio-info radio-inline'><input type='radio' data-term='null' name='termSelect' checked><label for='termSelector'>All Terms</label></div>";
                                                currentView.$el.find(".graphTermsToggleButtons").append(allTermsSelector);
                                            }

                                            for (var i = 0; i < terms.length; i++) {
                                                var checkedAttribute = terms.length === 1 ? 'checked' : ' ';
                                                var currentTermSelector = "<div class='radio radio-info radio-inline'><input type='radio' data-term='{0}' name='termSelect' {1}><label for='termSelector'>{0} mo. Term</label></div>";
                                                currentView.$el.find(".graphTermsToggleButtons").append(String.format(currentTermSelector, terms[i], checkedAttribute));
                                            }

                                            currentView.WidgetsRow.show();
                                            if (returnValue.AuctionTypeId === En.AuctionTypeId.SealedBid || returnValue.AuctionTypeId === En.AuctionTypeId.Direct || returnValue.AuctionTypeId === En.AuctionTypeId.TargetPrice) {
                                                currentView.SupplierWidgets.remove();
                                            }
                                            _refreshBiddingChart(currentView);
                                        }

                                        if (returnValue.CanEdit === false) {
                                            //We remove the suppliers tab link and its content
                                            currentView.$el.find("#suppliers").remove();
                                            currentView.$el.find("a[href='#suppliers']").remove();
                                        }

                                        if (returnValue.AuctionTypeCanSeeOtherPeopleBids === false) {
                                            currentView.BiddingControlsFooter.remove();
                                        }

                                        if (returnValue.CanExtend === true) {
                                            if (returnValue.ProposedEndTime != null) {
                                                currentView.ExtendRFQ.removeClass('visibilityNone');
                                            } else {

                                                currentView.ExtendRFQ.removeClass('visibilityNone');

                                            }
                                        }
                                    }
                                }
                                else {
                                    // the auction is set to manual start and has not started yet
                                    auctionNotStartedScheduledMessage = "The RFQ is set to be started manually so come back later to check if it has already started.";
                                }
                            }
                            else {
                                auctionHasFinished = true;
                            }


                            if (auctionHasFinished === true) {
                                //currentView.AuctionAlreadyFinishedContainer.removeClass("visibilityNone");
                                window.location = 'view';
                            }
                            else if (auctionHasStarted === false) {
                                currentView.AuctionHasNotStartedScheduleMessage.html(auctionNotStartedScheduledMessage);
                                currentView.AuctionHasNotStartedYetContainer.show(true);
                            }
                            else {
                                currentView.AuctionHasStartedContainer.show(true);
                                setTimeout(function () {
                                    _getBidsData(currentView)
                                }, 10);
                            }

                            _startPushNotifications(currentView, returnValue);
                        }
                    }
                    else {
                        Tn.ShowError(Const.UNEXPECTED_ERROR_AJAX_CALL_MESSAGE);
                    }
                });

                this.Wizard.bootstrapWizard({
                    tabClass: 'nav nav-tabs',
                    onTabSelected: function (tab, navigation, index) {

                    },
                    onTabShow: function (tab, navigation, index) {
                        if (tab.find("[href='#documents']").length > 0) /* documents */ {
                            if (currentView.documentsGridInstance == null) {
                                currentView.documentsGridInstance = new AuctionDocumentsGridView();
                                currentView.documentsGridInstance.options = {
                                    localDataSource: _uploadedFiles,
                                    readOnly: false
                                };

                                if (App.isLoggedUserASupplier() === true) {
                                    currentView.documentsGridInstance.options.editOnlyYourOwn = true;
                                    currentView.documentsGridInstance.options.actionUserId = _auctionData.ActionUserId;
                                }

                                currentView.FileUploadInstance = new Fu();
                                currentView.FileUploadContainer.append(currentView.FileUploadInstance.render().el);
                                if (App.isLoggedUserAnCustomer() || App.isLoggedUserAnPartner() || App.isLoggedRFQViewerOnlyUser()) {
                                    currentView.FileUploadContainer.closest(".row").remove();
                                    currentView.documentsGridInstance.options.readOnly = true;
                                }

                                currentView.documentsGridInstance.on("auctionDocumentsGrid:fileDeleted", function (fileId) {

                                    if (fileId != null) {
                                        Ah.doAjaxRequest('DELETE', String.format('/api/rfqs/{0}/document/delete/{1}', currentView.options.encryptedAuctionId, fileId), null, function (responseData) {
                                            if (responseData === true) {
                                                Tn.ShowSuccess("Document deleted successfully");
                                            }
                                            else {
                                                Tn.ShowError("An error occurred while deleting your document.  Please contact an administrator.");
                                            }
                                        });
                                        /*Tn.ShowConfirmDialog("Are you sure you want to delete this document from the RFQ?",
                                            function () {
                                                Ah.doAjaxRequest('DELETE', String.format('/api/rfqs/{0}/document/delete/{1}', currentView.options.encryptedAuctionId, fileId), null, function (responseData) {
                                                    if (responseData === true) {
                                                        Tn.ShowSuccess("Document deleted successfully");
                                                    }
                                                    else {
                                                        Tn.ShowError("An error occurred while deleting your document.  Please contact an administrator.");
                                                    }
                                                });
                                            }, null,
                                            null);*/
                                    }

                                })
                                currentView.FileUploadInstance.on("fileupload:newfileuploaded", function (fileData) {

                                    var requestData = {
                                        fileIndex: currentView.documentsGridInstance.options.localDataSource.length,
                                        data: fileData
                                    };

                                    Tn.ShowConfirmDialog("Are you sure you want to add this document to the RFQ?",
                                        function () {
                                            Ah.doAjaxRequest('POST', String.format('/api/rfqs/{0}/document/submit', currentView.options.encryptedAuctionId), requestData, function (responseData) {
                                                if (responseData === true) {
                                                    Tn.ShowSuccess("Document added successfully");
                                                }
                                                else {
                                                    Tn.ShowError("An error occurred while adding your document.  Please contact an administrator.");
                                                }
                                            });
                                        }, null,
                                        null);

                                    //currentView.documentsGridInstance.options.localDataSource.push({
                                    //    fileIndex: currentView.documentsGridInstance.options.localDataSource.length, data: fileData
                                    //});

                                    //currentView.documentsGridInstance.refreshGrid();
                                });

                                currentView.$el.find('#documents').append(currentView.documentsGridInstance.render().el);
                            }
                            else {
                                currentView.documentsGridInstance.refreshGrid();
                            }
                        }
                        else if (tab.find("[href='#meters']").length > 0) /* meters */ {
                            if (currentView.MetersGridInstance != null) {
                                Gh.refreshGrid(currentView.MetersGridInstance);
                            }
                        }
                        else if (tab.find("[href='#suppliers']").length > 0) {

                            if (_auctionData.CanViewOtherPeopleBids === true || App.isLoggedUserAnCustomer() || App.isLoggedUserAnPartner()) {
                                if (currentView.SuppliersAvailableToUseInstance == null) {
                                    currentView.SuppliersAvailableToUseInstance = new SuppliersAvailableToUseView();

                                    currentView.SuppliersAvailableToUseInstance.options = {
                                        showRemoveButton: false,
                                        showCheckboxes: true
                                    }

                                    currentView.SuppliersAvailableToUseInstance.options.filterFromEncryptedAuctionId = currentView.options.encryptedAuctionId;
                                    currentView.SuppliersAvailableToUseInstance.direction = _auctionData.AuctionDirectionId;

                                    if (_auctionData.EncryptedEventId !== null) {
                                        currentView.SuppliersAvailableToUseInstance.options.showOnlyFromEncryptedEventId = _auctionData.EncryptedEventId;
                                        currentView.SuppliersAvailableToUseInstance.options.eventNumber = _eventData.Number;
                                    }
                                    currentView.SuppliersAvailableToUseInstance.options.showOnlyWholesale = _auctionData.IsWholesale;
                                    currentView.$el.find('#addSuppliers').html(currentView.SuppliersAvailableToUseInstance.render().el);

                                    $('#collapseAddSuppliers').on('show.bs.collapse', function () {
                                        currentView.SuppliersAvailableToUseInstance.refreshGrid();
                                    });
                                } else {
                                    currentView.SuppliersAvailableToUseInstance.options.showOnlyWholesale = _auctionData.IsWholesale;
                                    currentView.SuppliersAvailableToUseInstance.refreshGrid();
                                }

                                if (currentView.InvitationStatusesGridInstance == null) {
                                    currentView.InvitationStatusesGridInstance = Gh.createGridForAjax(currentView.InvitationStatusesGrid,
                                        String.format('/api/rfqs/{0}/Invites', currentView.options.encryptedAuctionId),
                                        [
                                            {
                                                data: "SupplierName", mRender: Gh.columnStringFormatter
                                            },
                                            {
                                                data: "FirstName", mRender: Gh.columnStringFormatter
                                            },
                                            {
                                                data: "LastName", mRender: Gh.columnStringFormatter
                                            },
                                            {
                                                data: "Email", mRender: function (data, type, full) {
                                                    var toReturn = '';

                                                    toReturn += String.format("<span class='emailForChat'>{0}</span>", data);

                                                    toReturn += Const.COLUMN_SEPARATOR;

                                                    var name = full.FullName;
                                                    var picture = full.Picture;
                                                    var company = full.CompanyName;
                                                    var id = full.SupplierId;

                                                   // toReturn += String.format("{0}", window.sbWidget.createIndicatorElement(data, name, picture, company, id, 'supplier'));

                                                    return toReturn;
                                                }
                                            },
                                            {
                                                data: "Status", visible: _auctionData.EncryptedEventId == null
                                            },
                                            {
                                                data: "EncryptedId", orderable: false, mRender: function (data, type, full) {
                                                    var toReturn = [];

                                                    if (_auctionData.CanEdit) {

                                                        var resendInviteBtn = String.format("<a name='resendInviteBtn' data-toggle='tooltip' title='Resend Invite' type='button' data-eid='{0}' class='btn btn-success'><i class='uil uil-envelope-alt' aria-hidden='true'></i></a>",
                                                            data);

                                                        toReturn.push(resendInviteBtn);
                                                        var supplierTitle = "supplier";
                                                        if (_auctionData.AuctionDirectionId == En.AuctionDirectionId.Forward) {
                                                            supplierTitle = "Bidder";
                                                        }
                                                        var deleteSupplierBtn = String.format("<a name='deleteSupplierBtn' type='button' data-toggle='tooltip' data-placement='left' title='Remove " + supplierTitle + "' data-eid='{0}' data-loading-text='{1}' class='btn btn-danger'><span class='mdi mdi-close'></span></a>",
                                                            data, '<i class="fa fa-spinner fa-spin"></i> Removing...');

                                                        toReturn.push(deleteSupplierBtn);
                                                    }

                                                    return Gh.getButtonsFromArray(toReturn);
                                                }
                                            }
                                        ],
                                        {
                                            searching: true,
                                            destroy: true,
                                            emptyTableMessage: 'No invites have been sent yet'
                                        });

                                    $('#collapseRemoveSuppliers').on('show.bs.collapse', function () {
                                        currentView.InvitationStatusesGridInstance.ajax.reload();
                                    });
                                }
                                else {
                                    currentView.InvitationStatusesGridInstance.ajax.reload();
                                }
                                if (currentView.MessageSuppliersGridInstance == null) {
                                    currentView.MessageSuppliersGridInstance = Gh.createGridForAjax(currentView.MessageSuppliersGrid,
                                        String.format('/api/rfqs/{0}/Invites', currentView.options.encryptedAuctionId),
                                        [
                                            {

                                                data: "CompanyId",
                                                className: "text-center logo-column",
                                                mRender: function (data, type, full) {
                                                    var toReturn = String.format("<span title='{0}' data-toggle='tooltip' data-placement='right'><img title = '{0}' style='max-width:80%; max-height:94px; height:auto; width:auto; ' src='/api/company/{1}/logo'/></span>", full.SupplierName, data);

                                                    return toReturn;
                                                }
                                            },
                                            {
                                                data: "FirstName", mRender: Gh.columnStringFormatter
                                            },
                                            {
                                                data: "LastName", mRender: Gh.columnStringFormatter
                                            },
                                            {

                                                data: "EncryptedUserId", className: 'text-center', orderable: false, mRender: function (data, type, full) {
                                                    var toReturn = '';

                                                    toReturn += String.format("<input type='checkbox' name='chkCurrentSupplier' data-id='{0}' data-eid='{1}'/>",
                                                        full.Id,
                                                        data);

                                                    return toReturn;
                                                }
                                            }
                                        ],
                                        {
                                            searching: false,
                                            destroy: true,
                                            lengthChange: false,
                                            buttons: [],
                                            emptyTableMessage: 'No invites have been sent yet',
                                            onGridFinishedRender: function () {
                                                var checkboxes = $("[name='chkCurrentSupplier']");
                                                Ch.build(checkboxes);
                                                // I need to check the proper boxes
                                                for (var i = 0; i < currentView.selectedUsers.length; i++) {
                                                    var currentUserId = currentView.selectedUsers[i].Id;
                                                    var checkbox = currentView.MessageSuppliersGrid.find(String.format("input[name='chkCurrentSupplier'][data-id='{0}']", currentUserId));
                                                    Ch.setValue(checkbox, true);
                                                }
                                            }
                                        });


                                    $('#messageInvitationSuppliers').hide();
                                }
                                else {
                                    currentView.MessageSuppliersGridInstance.ajax.reload();
                                }
                            }
                        }
                    }
                });

                this.GraphWizard.bootstrapWizard({
                    tabClass: 'nav nav-tabs',
                    onTabSelected: function (tab, navigation, index) {

                    },
                    onTabShow: function (tab, navigation, index) {
                        if (tab.find("[href='#pricesDistributionGraphTab']").length > 0) /* prices distribution */ {
                            if (currentView.PricesDistributionGraphInstance == null) {
                                _refreshBiddingChart(currentView);
                            }
                            else {
                                currentView.PricesDistributionGraphInstance.refreshGraph("all", currentView.termSelected);
                            }

                        }
                        else if (tab.find("[href='#lowestPricesGraphTab']").length > 0) /* lowest prices */ {
                            if (currentView.LowestPricesGraphInstance == null) {
                                _refreshBiddingChart(currentView);
                            }
                            else {
                                currentView.LowestPricesGraphInstance.refreshGraph("lowest", currentView.termSelected);
                            }
                        }
                        else if (tab.find("[href='#bidStackGraphTab']").length > 0) /* bid Stack visual */ {
                            if (currentView.BidStackGraphInstance == null) {
                                _refreshBiddingChart(currentView);
                            }
                            else {
                                currentView.BidStackGraphInstance.refreshGraph(En.BidStackChartType.Optimized, currentView.termSelected);
                            }
                        }

                        else if (tab.find("[href='#WAPGraphTab']").length > 0) /* WAP visual */ {
                            if (currentView.WAPGraphInstance == null) {
                                _refreshBiddingChart(currentView);
                            }
                            else {
                                currentView.WAPGraphInstance.refreshGraph();
                            }
                        }
                    }
                });

                if (Session.isLoggedUserABrokerInASupplierPortal() === true) {
                    currentView.RFQDetailsTab.hide();
                    currentView.GasPriceAssumptionColumn.hide();
                    currentView.SuppliersTab.html("Invitation");
                    currentView.QuoteSubmissionTab.hide();
                }

                return this;
            },

            removeSupplier: function (sender) {
                var currentView = this;
                var senderAsJqueryObject = $(sender.target);
                var encryptedId = Ut.getAttributeFromSender(sender, "data-eid");
                var currentView = this;
                var supplierText = "";
                if (_auctionData.AuctionDirectionId == En.AuctionDirectionId.Forward) {
                    supplierText = "bidder";
                } else {
                    supplierText = "supplier";
                }

                Tn.ShowConfirmDialog("Are you sure you want to remove this " + supplierText + "?",
                    function () {
                        senderAsJqueryObject.button('loading');
                        Ah.doAjaxRequest('DELETE', '/api/invite/delete/' + encryptedId, null, function (responseData) {
                            if (responseData === true) {
                                Tn.ShowSuccess(supplierText.charAt(0).toUpperCase() + supplierText.slice(1) + " removed successfully")
                                currentView.InvitationStatusesGridInstance.ajax.reload();
                                currentView.SuppliersAvailableToUseInstance.refreshGrid();
                                currentView.updateAddSuppliersButton();
                            }
                            else {
                                Tn.ShowError("An error occurred while removing the " + supplierText + ", please contact an administrator!");
                            }
                        });
                    }, null,
                    function () {
                        senderAsJqueryObject.button('reset');
                    });
            },
            resendSupplierInvite: function (sender) {
                var currentView = this;
                var encryptedId = Ut.getAttributeFromSender(sender, "data-eid");
                var supplierText = "";
                if (_auctionData.AuctionDirectionId == En.AuctionDirectionId.Forward) {
                    supplierText = "bidder";
                } else {
                    supplierText = "supplier";
                }
                Tn.ShowConfirmDialog("Are you sure you want to resend this invite?",
                    function () {
                        Ah.doAjaxRequest('POST', String.format('/api/rfqs/{0}/resendInvite/{1}', currentView.options.encryptedAuctionId, encryptedId), null, function (responseData) {
                            if (responseData === true) {
                                Tn.ShowSuccess(supplierText.charAt(0).toUpperCase() + supplierText.slice(1) + " invite sent successfully.")
                            }
                            else {
                                Tn.ShowError("An error occurred while inviting the " + supplierText + ", please contact an administrator!");
                            }
                        });
                    });
            },

            updateAddSuppliersButton: function () {
                var currentView = this;
                var selectedSuppliersCount = currentView.SuppliersAvailableToUseInstance.getSelectedUsers().length;

                document.getElementsByName("addSuppliersBtn")[0].disabled = selectedSuppliersCount > 0 ? false : true;
            },

            addSuppliers: function () {
                var currentView = this;
                var supplierText = "";
                if (_auctionData.AuctionDirectionId == En.AuctionDirectionId.Forward) {
                    supplierText = "bidders";
                } else {
                    supplierText = "suppliers";
                }

                Tn.ShowConfirmDialog("Are you sure you want to add the selected " + supplierText + "?",
                    function () {

                        var newSuppliers = currentView.SuppliersAvailableToUseInstance.getSelectedUsers();
                        var newSuppliersData = {
                            EncryptedSupplierUserIds: newSuppliers
                        }

                        Ah.doAjaxRequest('POST', String.format('/api/rfqs/{0}/InviteSuppliers', currentView.options.encryptedAuctionId), newSuppliersData, function (responseData) {
                            if (responseData === true) {
                                Tn.ShowSuccess(supplierText.charAt(0).toUpperCase() + supplierText.slice(1) + " added successfully")
                                currentView.InvitationStatusesGridInstance.ajax.reload();
                                currentView.MessageSuppliersGridInstance.ajax.reload();
                                currentView.SuppliersAvailableToUseInstance.refreshGrid();
                                currentView.SuppliersAvailableToUseInstance.selectedUsers = [];
                                currentView.updateAddSuppliersButton();
                            }
                            else {
                                Tn.ShowError("An error occurred while adding the " + supplierText + ", please contact an administrator!");
                            }
                        });
                    }, null);
            },

            refreshGraphsForTerm: function (sender) {
                var currentView = this;
                var newTerm = $(sender.target).data('term');

                currentView.termSelected = newTerm;

                _refreshBiddingChart(currentView);
            },

            sendSupplierMessage: function (sender) {
                var currentView = this;
                var message;
                var senderAsJqueryObject = $(sender.target);
                var selectedMessageToSupplier = currentView.getSelectedUsersForMessage();
                var messageSupplierName = "suppliers";
                if (_auctionData.AuctionDirectionId == En.AuctionDirectionId.Forward) {
                    messageSupplierName = "bidders";
                }
                if (selectedMessageToSupplier.length > 0) {
                    message = "Are you sure you want to send this message to selected " + messageSupplierName + " invited to this RFQ?";
                }
                else {
                    message = "Are you sure you want to send this message to all " + messageSupplierName + " invited to this RFQ?"
                }
                Tn.ShowConfirmDialog(message, function () {

                    var requestData = {
                        MessageContent: currentView.BulkSupplierMessageInput.val(),
                        CopySender: currentView.BulkSupplierCopySenderToggle.prop('checked'),
                        SelectedSupplierIds: selectedMessageToSupplier
                    }

                    Ah.doAjaxRequest('POST', String.format('/api/rfqs/{0}/message/suppliers', currentView.options.encryptedAuctionId), requestData, function (responseData) {
                        if (responseData == true) {
                            Tn.ShowSuccess("Message sent successfully");
                            currentView.BulkSupplierMessageInput.val('');
                            currentView.SubmitSupplierMessageBtn.addClass('disabled');
                            currentView.SubmitSupplierMessageBtn.attr('disabled', 'disabled');
                        } else {
                            Tn.ShowSuccess("An error occured while sending your message.  Please contact an administrator.");
                        }
                    }, null,
                        null);

                });
            },

            confirmBid: function (sender) {
                Tn.ClearAllNotifications();
                var currentView = this;
                var tableBody = currentView.SubmitBidGrid.find("#tableBodySubmission");

                if (App.isLoggedUserABrokerUser() === true && currentView.InvitedSupplierCompaniesDDL.val() == null) {
                    Tn.ShowError("You must select a supplier in order to submit.");
                    return;
                }

                var pressedButton = $(sender.target);
                var pressedTerm = pressedButton.data('term');
                var correctForm = $(String.format("form[data-term='{0}']", pressedTerm));
                var newTerm = pressedTerm == "{termNumber}";
                var validateIfNewTerm = (!newTerm || tableBody.find("[name='newTermForm']").parsley().validate() === true);

                if (correctForm.parsley({ excluded: ":hidden" }).validate() === true && validateIfNewTerm) {
                    Tn.ShowConfirmDialog("Are you sure you want to submit this price? This action is irreversible.",
                        function () {

                            pressedButton.button('loading');

                            if (newTerm) {
                                var newTermValue = tableBody.find("[id='bidTermInput']").val();
                                pressedTerm = newTermValue;
                                tableBody.find("[data-term='{termNumber}']").attr('data-term', newTermValue);
                                //tableBody.find("[data-target='#WAPDetailsCollapse-{termNumber}']").attr('data-target', String.format("WAPDetailsCollapse-{0}", newTermValue));
                                //tableBody.find("[id='WAPDetailsCollapse-{termNumber}']").attr('id', String.format("WAPDetailsCollapse-{0}", newTermValue));
                            }

                            var priceInput = correctForm.find("#bidPriceInput");
                            var adderInput = correctForm.find("#bidAdderInput");
                            var multiplierInput = correctForm.find("#bidMultiplierInput");
                            var onAdderInput = correctForm.find("#bidOnAdderInput");
                            var offAdderInput = correctForm.find("#bidOffAdderInput");
                            var quantityInput = correctForm.find("#bidQuantityInput");
                            var commentsArea = $(String.format("tr[data-term='{0}']", pressedTerm)).next().find("#bidCommentArea");

                            var requestData = {
                                Term: pressedTerm,
                                Price: priceInput.val(),
                                Adder: adderInput.val(),
                                Multiplier: multiplierInput.val(),
                                OnAdder: onAdderInput.val(),
                                OffAdder: offAdderInput.val(),
                                Quantity: quantityInput.val(),
                                Comments: commentsArea.val(),
                                Timestamp: Ut.getCurrentMoment(true),
                                RfqProductType: {
                                    Id: currentView.CurrentProductTypeDDL.val()
                                },
                                BehalfOnSupplierUserId: currentView.InvitedSupplierCompaniesDDL.val(),
                                IsBehalfOnSupplier: App.isLoggedUserABrokerUser() === true ? true : false
                            }

                            Ah.doAjaxRequest('POST', String.format('/api/rfqs/{0}/bid', currentView.options.encryptedAuctionId), requestData,
                                function (responseData) {
                                    var errorMessage = null;
                                    if (responseData.ResponseID === En.AuctionBidResponseId.Success) {
                                        Tn.ShowSuccess("Price submitted successfully.");

                                        priceInput.val('');
                                        adderInput.val('');
                                        multiplierInput.val('');
                                        onAdderInput.val('');
                                        offAdderInput.val('');
                                        quantityInput.val('');
                                        commentsArea.val('').keyup();

                                        //We reset the _quoteInputsActive variable and fetch the current prices
                                        _quoteInputsActive = false;
                                        _updateCurrentPrices(currentView);
                                        $("[name='declineBidBtn']").remove();
                                        if (_splittedTerms.length > 1) {
                                            currentView.BidAllButton.parent().attr('class', 'col-md-4 col-md-offset-5');
                                        }
                                    }
                                    else if (responseData.ResponseID === En.AuctionBidResponseId.BidGreaterThanOpeningBid) {
                                        if (_auctionData.AuctionDirectionId == En.AuctionDirectionId.Forward) {
                                            errorMessage = String.format("The submitted price needs to be greater than or equal to the starting price, {0}.",
                                                currentView.StartingPriceValue.html());
                                        } else {
                                            errorMessage = String.format("The submitted price needs to be less than or equal to the starting price, {0}.",
                                                currentView.StartingPriceValue.html());
                                        }
                                    }
                                    else if (responseData.ResponseID === En.AuctionBidResponseId.AuctionHasBeenCancelled) {
                                        errorMessage = "The RFQ has been cancelled and we couldn't submit your price.";
                                    }
                                    else if (responseData.ResponseID === En.AuctionBidResponseId.BidGreaterThanPrevious) {
                                        if (_auctionData.AuctionDirectionId == En.AuctionDirectionId.Forward) {
                                            errorMessage = "You have already submitted a price for the same term with a higher price than the one you tried to submit.";
                                        } else {
                                            errorMessage = "You have already submitted a price for the same term with a lower price than the one you tried to submit.";
                                        }
                                    }
                                    else if (responseData.ResponseID === En.AuctionBidResponseId.AuctionEnded) {
                                        errorMessage = String.format("The RFQ has already ended; your price was not accepted. You submitted your price at {0} and the RFQ ended at {1}",
                                            Fm.formatDateAndTimeUpToTheMilliseconds(requestData.Timestamp), Fm.formatDateAndTimeUpToTheMilliseconds(Ut.getMomentDateAndTimeFromServer(responseData.EffectiveAuctionEndDate)));
                                    }
                                    else if (responseData.ResponseID === En.AuctionBidResponseId.Forbidden) {
                                        errorMessage = "You are not allowed to price this RFQ" + Const.THINK_IS_A_MISTAKE_MESSAGE;
                                    }
                                    else if (responseData.ResponseID === En.AuctionBidResponseId.AuctionHasntStarted) {
                                        var auctionStartMessage = "and the RFQ is not scheduled to start automatically.";
                                        if (responseData.EffectiveAuctionStartDate != null) {
                                            auctionStartMessage = String.format("and the RFQ starts on {0}", Fm.formatDateAndTime(Ut.getMomentDateAndTimeFromServer(responseData.EffectiveAuctionStartDate)));
                                        }

                                        errorMessage = String.format("The RFQ has not started yet, and we couldn't submit your price, you submitted your price on {0}, {1}",
                                            Fm.formatDateAndTime(requestData.Timestamp), auctionStartMessage);
                                    }
                                    else if (responseData.ResponseID === En.AuctionBidResponseId.DuplicateBid) {
                                        errorMessage = "You have already submitted a price for the same term with the same price as the one you tried to submit.";
                                    }
                                    else if (responseData.ResponseID === En.AuctionBidResponseId.WholesaleBidLowerThanStartingPrice) {
                                        errorMessage = String.format("The submitted price needs to be greater than the starting price, {0}.",
                                            currentView.StartingPriceValue.html());
                                    }
                                    else if (responseData.ResponseID === En.AuctionBidResponseId.WholesaleBidQuantityLowerThanMinimumQuantity) {
                                        errorMessage = String.format("The submitted quantity needs to be greater than or equal to the minimum quantity, {0}.",
                                            _auctionData.WholesaleMinimumQuantity);
                                    }
                                    else {
                                        errorMessage = Const.UNEXPECTED_ERROR_AJAX_CALL_MESSAGE;
                                    }

                                    if (errorMessage != null) {
                                        Tn.ShowError(errorMessage);
                                    }

                                    if (newTerm) {
                                        Ah.doAjaxRequest('GET', String.format('/api/rfqs/{0}', _auctionData.EncryptedId), null,
                                            function (returnValue) {
                                                var auctionData = _auctionData;
                                                if (returnValue != null) {
                                                    auctionData = returnValue;
                                                }
                                                _splittedTerms = auctionData.Deal.TermsList.split(',');
                                                _showBiddingPanel(currentView, true, auctionData);

                                                if (currentView.IsBidBehalfOnSupplier === true) {
                                                    currentView.BiddingControlsColumn.remove();
                                                }
                                            });
                                    }
                                },
                                null,
                                function () {
                                    pressedButton.button('reset');
                                });
                        }, null, _auctionData.BidConfirmationDelayInSeconds, _auctionData.BlindDuringBidEntry, currentView);
                }
            },

            confirmMultipleBids: function (sender) {
                Tn.ClearAllNotifications();
                var currentView = this;

                var bidAllButton = $(sender.target);

                var newTerm = $("[id='bidTermInput']")?.val() != "";

                if (newTerm) {
                    $("[data-term='{termNumber}']").attr('data-term', $("[id='bidTermInput']").val());
                    var forms = $("form[data-term]");
                }
                else {
                    var forms = $("form[data-term]").not("[data-term='{termNumber}']");
                }

                forms = _.filter(forms, function (form) {
                    var allInputsEmpty = true;
                    var formInputs = $(form).find("input:visible");

                    for (var i = 0; i < formInputs.length; i++) {
                        var input = $(formInputs[i]);
                        if (input.val()) {
                            allInputsEmpty = false;
                        }
                    }

                    return !allInputsEmpty;
                });

                if (App.isLoggedUserABrokerUser() === true && currentView.InvitedSupplierCompaniesDDL.val() == null) {
                    Tn.ShowError("You must select a supplier in order to submit.");
                    return;
                }

                if (forms.length === 0) {
                    Tn.ShowError("You must input at least one price in order to submit.");
                    return;
                }

                var timestamp = Ut.getCurrentMoment(true);
                var requestData = {
                    BidsData: []

                };

                var atLeastOneFormInvalid = false;
                for (var i = 0; i < forms.length; i++) {
                    if ($(forms[i]).parsley({ excluded: ":hidden" }).validate() === false) {
                        atLeastOneFormInvalid = true;
                    }
                }

                if (atLeastOneFormInvalid === false) {
                    Tn.ShowConfirmDialog("Are you sure you want to submit these prices? This action is irreversible.",
                        function () {
                            bidAllButton.button('loading');
                            for (var i = 0; i < forms.length; i++) {

                                var currentForm = $(forms[i]);
                                var currentTerm = currentForm.data("term");

                                var priceInput = currentForm.find("#bidPriceInput");
                                var adderInput = currentForm.find("#bidAdderInput");
                                var multiplierInput = currentForm.find("#bidMultiplierInput");
                                var onAdderInput = currentForm.find("#bidOnAdderInput");
                                var offAdderInput = currentForm.find("#bidOffAdderInput");
                                var quantityInput = currentForm.find("#bidQuantityInput");
                                var commentsArea = $(String.format("tr[data-term='{0}']", currentTerm)).next().find("#bidCommentArea");
                                var newBid = {
                                    Term: currentTerm,
                                    Price: priceInput.val(),
                                    Adder: adderInput.val(),
                                    Multiplier: multiplierInput.val(),
                                    OnAdder: onAdderInput.val(),
                                    OffAdder: offAdderInput.val(),
                                    Quantity: quantityInput.val(),
                                    Comments: commentsArea.val(),
                                    Timestamp: timestamp,
                                    RfqProductType: {
                                        Id: currentView.CurrentProductTypeDDL.val()
                                    },
                                    BehalfOnSupplierUserId: currentView.InvitedSupplierCompaniesDDL.val(),
                                    IsBehalfOnSupplier: App.isLoggedUserABrokerUser() === true ? true : false
                                }
                                requestData.BidsData.push(newBid);
                            }

                            Ah.doAjaxRequest('POST', String.format('/api/rfqs/{0}/bidAll', currentView.options.encryptedAuctionId), requestData,
                                function (responseData) {

                                    if (responseData.Success === true) {
                                        Tn.ShowSuccess("Prices submitted successfully.")

                                        for (var i = 0; i < forms.length; i++) {
                                            var currentForm = $(forms[i]);

                                            var priceInput = currentForm.find("#bidPriceInput");
                                            var adderInput = currentForm.find("#bidAdderInput");
                                            var multiplierInput = currentForm.find("#bidMultiplierInput");
                                            var onAdderInput = currentForm.find("#bidOnAdderInput");
                                            var offAdderInput = currentForm.find("#bidOffAdderInput");
                                            var commentsArea = $("tr[name*='commentsRow']").eq(i).find("textarea");

                                            priceInput.val('');
                                            adderInput.val('');
                                            multiplierInput.val('');
                                            onAdderInput.val('');
                                            offAdderInput.val('');
                                            quantityInput.val('');
                                            commentsArea.val('').keyup();

                                            //We reset the _quoteInputsActive variable and fetch the current prices
                                            _quoteInputsActive = false;
                                            _updateCurrentPrices(currentView);
                                        }

                                        if (newTerm) {
                                            Ah.doAjaxRequest('GET', String.format('/api/rfqs/{0}', _auctionData.EncryptedId), null,
                                                function (returnValue) {
                                                    var auctionData = _auctionData;
                                                    if (returnValue != null) {
                                                        auctionData = returnValue;
                                                    }
                                                    _splittedTerms = auctionData.Deal.TermsList.split(',');
                                                    _showBiddingPanel(currentView, true, auctionData);

                                                    if (currentView.IsBidBehalfOnSupplier === true) {
                                                        currentView.BiddingControlsColumn.remove();
                                                    }
                                                });
                                        }

                                    }
                                    else {
                                        Rh.processRfqBidSubmitErrors(responseData.Errors, _auctionData);
                                    }
                                },
                                null,
                                function () {
                                    bidAllButton.button('reset');
                                });
                        }, null, _auctionData.BidConfirmationDelayInSeconds, _auctionData.BlindDuringBidEntry, currentView);
                }

            },
            updateSupplierCreditStatus: function (sender) {
                var currentView = this;
                var senderAsJqueryObject = $(sender.target);

                if (currentView.UpdateSupplierCreditStatusForm.parsley().validate() === true) {
                    Tn.ShowConfirmDialog("Are you sure that you want to update this customer's credit status?", function () {
                        senderAsJqueryObject.button('loading');
                        var statusId = currentView.CreditStatusesDDL.val();
                        var depositAmount = currentView.DepositAmount.val();;
                        var otherStatus = currentView.CreditStatusComments.val();

                        var data = {
                            StatusId: statusId,
                            DepositAmount: depositAmount,
                            OtherStatus: otherStatus
                        }

                        Ah.doAjaxRequest('PUT', String.format('/api/rfqs/{0}/creditStatus', currentView.options.encryptedAuctionId), data, function (responseData) {
                            if (responseData === true) {
                                Tn.ShowSuccess("Credit Status updated successfully");
                                _refreshCreditStatusInputs(currentView);
                            }
                            else {
                                Tn.ShowError("An error occurred while updating your credit status.  Please contact an administrator.");
                            }
                        }, null, function () {
                            senderAsJqueryObject.button('reset');
                        });
                    });
                }

            },
            endRFQ: function (sender) {
                var currentView = this;
                var senderAsJqueryObject = $(sender.target);

                Rh.endRFQ(senderAsJqueryObject, _auctionData.EncryptedId,
                    _auctionData.AuctionTypeId,
                    function () { location.reload(); });
            },
            getSelectedUsersForMessage: function () {
                var toReturn = [];
                for (var i = 0; i < this.selectedUsers.length; i++) {
                    var currentUser = this.selectedUsers[i];
                    toReturn.push(currentUser.EncryptedId)
                }

                return toReturn;
            },
            contactCheckChangedForMessage: function (sender) {
                var input = $(sender.target);
                var id = input.data("id");
                var encryptedId = input.data("eid");

                if (input.prop('checked') === true) {
                    //iff it is not already in the list
                    var filteredArray = this.selectedUsers.filter(function (item) {
                        if (item.Id == id) { return item; }
                    });
                    if (filteredArray.length === 0) {
                        // we add it
                        this.selectedUsers.push({ Id: id, EncryptedId: encryptedId });
                    }
                }
                else {
                    // we remove it
                    for (var i = 0; i < this.selectedUsers.length; i++) {
                        var currentUser = this.selectedUsers[i];
                        if (currentUser.Id == id) {
                            this.selectedUsers.splice(i, 1);
                            break;
                        }
                    }
                }
                this.validateSupplierMesssageButton();
            },
            validateSupplierMesssageButton: function () {
                var currentView = this;
                // All suppliers Condition
                if (!currentView.selectedOnlyMessageSuppliers && currentView.BulkSupplierMessageInput.val().length) {
                    currentView.SubmitSupplierMessageBtn.removeClass('disabled');
                    currentView.SubmitSupplierMessageBtn.attr('disabled', false);
                }
                // Selected suppliers condition
                else if (currentView.selectedOnlyMessageSuppliers && (currentView.selectedUsers.length > 0) && currentView.BulkSupplierMessageInput.val().length) {
                    currentView.SubmitSupplierMessageBtn.removeClass('disabled');
                    currentView.SubmitSupplierMessageBtn.attr('disabled', false);
                } else {
                    currentView.SubmitSupplierMessageBtn.addClass('disabled');
                    currentView.SubmitSupplierMessageBtn.attr('disabled', 'disabled');
                }
            },
            messageSuppliersToggle: function (sender) {
                var currentView = this;
                var senderAsJqueryObject = $(sender.target);
                switch (senderAsJqueryObject.val()) {
                    case 'all':
                        currentView.MessageSuppliersDiv.hide();//addClass('hide');
                        currentView.unSelectAllSuppliers();
                        currentView.selectedUsers = [];
                        currentView.selectedOnlyMessageSuppliers = false;
                        break;
                    case 'selected':
                        currentView.MessageSuppliersDiv.show();//removeClass('hide');
                        currentView.SubmitSupplierMessageBtn.addClass('disabled');
                        currentView.selectedOnlyMessageSuppliers = true;
                        $($.fn.dataTable.tables(true)).DataTable()
                            .columns.adjust();
                        break;
                }
                currentView.validateSupplierMesssageButton();
            },

            MessageSupplierDefaultVisibility: function () {
                var currentView = this;
                //currentView.MessageSuppliersGridInstance.ajax.reload();
                //currentView.MessageSuppliersGridInstance.refreshGrid();
                //$('#messageInvitationSuppliers').css('display', 'none');
            },

            unSelectAllSuppliers: function () {
                var checkboxes = $("[name='chkCurrentSupplier']");
                for (var i = 0; i < checkboxes.length; i++) {
                    var currentBox = checkboxes[i];
                    currentBox.checked = false;
                    currentBox.parentNode.className = "icheckbox_square-green";
                }
            },
            extendsRFQ: function (sender) {
                var currentView = this;
                var senderAsJqueryObject = $(sender.target);
                var encryptedId = _auctionData.EncryptedId;
                var pricingPageLink = location.href.toString().replace("bids", "bid");
                ResumeRFQModalView.createNewInstance(encryptedId, function () { location.assign(pricingPageLink) }, "Change RFQ End Time", _auctionData.StatusId, _auctionData.ProposedEndTime);
            },
            exportRfqToExcel: function (sender) {
                var currentView = this;
                var senderAsJqueryObject = $(sender.target);

                var encryptedAuctionId = _auctionData.EncryptedId;
                var auctionName = _auctionData.Name;

                senderAsJqueryObject.button('loading');

                Ah.doAjaxRequest('POST', String.format('/api/rfqs/{0}/export?timeZoneOffset={1}',
                    encryptedAuctionId,
                    new Date().getTimezoneOffset() * -1), null,
                    function (responseData) {
                        if (responseData != null) {
                            var url = appWebPath + "/" + responseData;
                            var fileName = String.format('{0}.xlsx', auctionName);
                            Ah.saveFileFromUrl(url, fileName);
                        }
                        else {
                            Tn.ShowError(Const.UNEXPECTED_ERROR_AJAX_CALL_MESSAGE);
                        }
                    },
                    null,
                    function () {
                        senderAsJqueryObject.button('reset');
                    });
            },
            collapse: function (sender) {
                var target = $(sender.target);
                var content = target.next();
                content.slideToggle(500);
            },

            //CM-11825
            submitDeclineBidDescription: function (sender) {
                var currentView = this;
                var bidDeclineDescription;
                var target = $(sender.target);

                var isFormValid = currentView.DeclineBidForm.parsley().validate();

                if (isFormValid === true) {
                    if (currentView.BidDeclineDescriptionDDL.val() != "Other") {
                        bidDeclineDescription = currentView.BidDeclineDescriptionDDL.val();
                    }
                    else {
                        bidDeclineDescription = currentView.BidDeclineDescription.val();
                    }
                    var requestData = {
                        EncryptedAuctionId: currentView.options.encryptedAuctionId,
                        BidDeclineDescription: bidDeclineDescription
                    };
                    target.button('loading');
                    Ah.doAjaxRequest('POST', '/api/invite/decline', requestData, function (responseData) {
                        if (responseData === En.DeclineBidResponse.Success) {
                            Tn.ShowSuccess("RFQ declined successfully.");
                            setTimeout(function () {
                                window.location.replace('/RFQs/Grid');
                            }, 4000);
                        }
                        else if (responseData === En.DeclineBidResponse.AlreadyDeclined) {
                            Tn.ShowError("The RFQ is already declined.");
                        }
                        else {
                            Tn.ShowError("An error occurred declining the RFQ, please contact an administrator!");
                        }
                        target.button('reset');
                        currentView.DeclineBidFormContainer.modal('hide');
                    });
                }


            },
            destroy: function () {
                this.undelegateEvents();
                this.$el.removeData().unbind();

                Rh.clearRFQRemainingTimeFunctions();

                if (this.bidsGridInstance != null) {
                    this.bidsGridInstance.destroy();
                }

                if (this.bidsGraphInstance != null) {
                    this.bidsGraphInstance.destroy();
                }

                if (this.documentsGridInstance != null) {
                    this.documentsGridInstance.destroy();
                }

                if (this.SupplierCreditStatusesGridInstance != null) {
                    this.SupplierCreditStatusesGridInstance.destroy();
                }

                if (this.ContactsGridViewInstance != null) {
                    this.ContactsGridViewInstance.destroy();
                }

                Wph.unbindEvents(_eventBinding);

                _previousBidsData = null;
                _quoteInputsActive = false;
                _previousCreditStatus = null;

                // Remove view from DOM
                this.remove();
                Backbone.View.prototype.remove.call(this);
            }
        }
    })());

    return view;
});